import { Logger } from '@nestjs/common';
import { AnyBulkWriteOperation, Db, ObjectId } from 'mongodb';
import { COLLECTION_NAMES } from '../json-schemas/constants';
import { readXlsxSheetByName } from './xlsx-reader';

const logger = new Logger('UltraTechExcelImporter');

interface CategorySeed {
  slug: string;
  name: string;
  colorHex: string;
  sortOrder: number;
}

const ULTRATECH_CATEGORIES: CategorySeed[] = [
  {
    slug: 'geles-y-liquidos',
    name: 'Geles y Líquidos Energéticos',
    colorHex: '#EF4444',
    sortOrder: 1,
  },
  {
    slug: 'barras-proteicas',
    name: 'Barras Proteicas y Energéticas',
    colorHex: '#F59E0B',
    sortOrder: 2,
  },
  {
    slug: 'suplementos-y-nutricion',
    name: 'Suplementos y Nutrición',
    colorHex: '#2563EB',
    sortOrder: 3,
  },
  {
    slug: 'shakers-y-accesorios',
    name: 'Shakers y Accesorios',
    colorHex: '#10B981',
    sortOrder: 4,
  },
  {
    slug: 'indumentaria',
    name: 'Indumentaria Ultra Tech',
    colorHex: '#8B5CF6',
    sortOrder: 5,
  },
];

function inferCategorySlug(productName: string): string {
  const lower = productName.toLowerCase();
  if (lower.startsWith('gel ') || lower.startsWith('liquid ')) {
    return 'geles-y-liquidos';
  }
  if (lower.includes('bar ') || lower.includes('barra')) {
    return 'barras-proteicas';
  }
  if (
    lower.includes('musculosa') ||
    lower.includes('remera') ||
    lower.includes('talle')
  ) {
    return 'indumentaria';
  }
  if (
    lower.includes('vaso') ||
    lower.includes('shaker') ||
    lower.includes('botella') ||
    lower.includes('pastillero')
  ) {
    return 'shakers-y-accesorios';
  }
  return 'suplementos-y-nutricion';
}

export async function importProductsFromExcel(
  db: Db,
  excelFilePath: string,
  sheetName = 'Productos',
): Promise<{
  totalRowsRead: number;
  uniqueProductsProcessed: number;
  insertedCount: number;
  updatedCount: number;
}> {
  const now = new Date();
  logger.log(
    `Leyendo pestaña "${sheetName}" desde archivo Excel: ${excelFilePath}...`,
  );

  const rows = readXlsxSheetByName(excelFilePath, sheetName);
  if (rows.length <= 1) {
    throw new Error(`La pestaña "${sheetName}" no contiene filas de productos.`);
  }

  // 1. Limpiar productos y categorías demo iniciales si existían
  const categoriesCol = db.collection(COLLECTION_NAMES.CATEGORIES);
  const productsCol = db.collection(COLLECTION_NAMES.PRODUCTS);

  await productsCol.deleteMany({ sku: { $in: ['BEB-001', 'SNK-001'] } });
  await categoriesCol.deleteMany({
    slug: { $in: ['bebidas', 'snacks-y-confiteria'] },
  });

  // 2. Asegurar las categorías de Ultra Tech en MongoDB Atlas
  const categoryIdBySlug = new Map<string, ObjectId>();
  for (const cat of ULTRATECH_CATEGORIES) {
    await categoriesCol.updateOne(
      { slug: cat.slug },
      {
        $setOnInsert: {
          _id: new ObjectId(),
          slug: cat.slug,
          createdAt: now,
        },
        $set: {
          name: cat.name,
          colorHex: cat.colorHex,
          sortOrder: cat.sortOrder,
          isActive: true,
          updatedAt: now,
        },
      },
      { upsert: true },
    );

    const doc = await categoriesCol.findOne({ slug: cat.slug });
    if (doc) {
      categoryIdBySlug.set(cat.slug, doc._id);
    }
  }

  // 3. Procesar filas de la hoja "Productos" (A: Id_Producto, B: Codigo, C: Nombre, D: Precio, E: Cod_Barras)
  const dataRows = rows.filter((r) => r.rowNumber > 1);
  const deduplicatedBySku = new Map<
    string,
    {
      externalId: number | null;
      sku: string;
      name: string;
      price: number;
      barcode: string | null;
      categoryId: ObjectId;
    }
  >();

  for (const row of dataRows) {
    const rawId = row.cells['A'];
    const rawCodigo = row.cells['B'];
    const rawNombre = row.cells['C'];
    const rawPrecio = row.cells['D'];
    const rawBarcode = row.cells['E'];

    if (rawCodigo === undefined || rawNombre === undefined) {
      continue;
    }

    const sku = String(rawCodigo).trim().toUpperCase();
    const name = String(rawNombre).trim();
    const price = Math.round(Number(rawPrecio) || 0);
    const externalId =
      rawId !== undefined && !isNaN(Number(rawId)) ? Number(rawId) : null;
    const barcode =
      rawBarcode !== undefined &&
      rawBarcode !== null &&
      String(rawBarcode).trim().length > 0
        ? String(rawBarcode).trim()
        : null;

    const categorySlug = inferCategorySlug(name);
    const categoryId =
      categoryIdBySlug.get(categorySlug) ||
      categoryIdBySlug.get('suplementos-y-nutricion')!;

    if (!deduplicatedBySku.has(sku)) {
      deduplicatedBySku.set(sku, {
        externalId,
        sku,
        name,
        price,
        barcode,
        categoryId,
      });
    }
  }

  // 4. Ejecutar bulkWrite con upsert por SKU en MongoDB Atlas
  const bulkOps: AnyBulkWriteOperation[] = [];
  for (const item of deduplicatedBySku.values()) {
    bulkOps.push({
      updateOne: {
        filter: { sku: item.sku },
        update: {
          $setOnInsert: {
            _id: new ObjectId(),
            sku: item.sku,
            costCents: 0,
            taxRateBasisPoints: 0,
            trackInventory: true,
            stock: 100, // Stock inicial operativo por defecto
            minStockAlert: 5,
            unit: 'UNIT',
            createdAt: now,
          },
          $set: {
            externalId: item.externalId,
            categoryId: item.categoryId,
            name: item.name,
            price: item.price,
            priceCents: item.price,
            barcode: item.barcode,
            isActive: true,
            updatedAt: now,
          },
        },
        upsert: true,
      },
    });
  }

  const bulkResult = await productsCol.bulkWrite(bulkOps, { ordered: false });

  logger.log(
    `[✓] Importación Excel completada: ${dataRows.length} filas leídas -> ${deduplicatedBySku.size} productos únicos procesados (${bulkResult.upsertedCount} nuevos insertados, ${bulkResult.modifiedCount} actualizados).`,
  );

  return {
    totalRowsRead: dataRows.length,
    uniqueProductsProcessed: deduplicatedBySku.size,
    insertedCount: bulkResult.upsertedCount,
    updatedCount: bulkResult.modifiedCount,
  };
}
