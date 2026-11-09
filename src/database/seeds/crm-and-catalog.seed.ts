import { Logger } from '@nestjs/common';
import { Db, ObjectId } from 'mongodb';
import { COLLECTION_NAMES } from '../json-schemas/constants';

export async function seedCrmAndCatalog(
  db: Db,
  crmUserId: ObjectId,
  logger: Logger,
): Promise<void> {
  const now = new Date();

  const customersCol = db.collection(COLLECTION_NAMES.CUSTOMERS);
  const customerCount = await customersCol.countDocuments();
  if (customerCount === 0) {
    await customersCol.insertOne({
      _id: new ObjectId(),
      fullName: 'María Fernanda Gómez',
      email: 'maria.gomez@ejemplo.com',
      activeDiscount: {
        isAvailable: true,
        percentage: 15,
        assignedAt: now,
        assignedByUserId: crmUserId,
        consumedAt: null,
        consumedInSaleNumber: null,
      },
      discountHistory: [
        {
          _id: new ObjectId(),
          percentage: 15,
          assignedByUserId: crmUserId,
          assignedAt: now,
          status: 'ASSIGNED',
          consumedAt: null,
          consumedInSaleNumber: null,
        },
      ],
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    logger.log(
      '[Seed] Cliente CRM creado: maria.gomez@ejemplo.com con 15% de descuento activo (1 solo uso).',
    );
  }

  const categoriesCol = db.collection(COLLECTION_NAMES.CATEGORIES);
  const categoryCount = await categoriesCol.countDocuments();
  if (categoryCount === 0) {
    const bebidasId = new ObjectId();
    const snacksId = new ObjectId();

    await categoriesCol.insertMany([
      {
        _id: bebidasId,
        name: 'Bebidas',
        slug: 'bebidas',
        colorHex: '#2563EB',
        sortOrder: 1,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: snacksId,
        name: 'Snacks y Confitería',
        slug: 'snacks-y-confiteria',
        colorHex: '#D97706',
        sortOrder: 2,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const productsCol = db.collection(COLLECTION_NAMES.PRODUCTS);
    await productsCol.insertMany([
      {
        _id: new ObjectId(),
        categoryId: bebidasId,
        sku: 'BEB-001',
        barcode: '7501055300075',
        name: 'Café Americano Frío 355ml',
        priceCents: 4500,
        costCents: 2200,
        taxRateBasisPoints: 1600,
        trackInventory: true,
        stock: 50,
        minStockAlert: 10,
        unit: 'UNIT',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: new ObjectId(),
        categoryId: snacksId,
        sku: 'SNK-001',
        barcode: '7501011115019',
        name: 'Barra de Proteína Chocolate 60g',
        priceCents: 3800,
        costCents: 1900,
        taxRateBasisPoints: 1600,
        trackInventory: true,
        stock: 40,
        minStockAlert: 8,
        unit: 'UNIT',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    logger.log('[Seed] Categorías y productos iniciales creados.');
  }
}
