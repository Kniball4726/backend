import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateProductDto, UpdateProductDto } from '../dto/catalog.dto';
import { Category, CategoryDocument } from '../schemas/category.schema';
import { Product, ProductDocument } from '../schemas/product.schema';

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
  ) {}

  async createProduct(dto: CreateProductDto) {
    if (!Types.ObjectId.isValid(dto.categoryId)) {
      throw new BadRequestException('categoryId inválido');
    }

    const category = await this.categoryModel.findById(dto.categoryId).lean();
    if (!category) {
      throw new NotFoundException('La categoría especificada no existe');
    }

    const created = await this.productModel.create({
      externalId: null,
      categoryId: new Types.ObjectId(dto.categoryId),
      sku: dto.sku.toUpperCase(),
      barcode: dto.barcode ?? null,
      name: dto.name,
      price: dto.priceCents,
      priceCents: dto.priceCents,
      costCents: dto.costCents,
      taxRateBasisPoints: dto.taxRateBasisPoints,
      trackInventory: dto.trackInventory,
      stock: dto.initialStock,
      minStockAlert: dto.minStockAlert,
      unit: dto.unit,
      isActive: true,
    });

    return created.toObject();
  }

  async findAllProducts(
    categoryId?: string,
    search?: string,
    includeInactive = false,
  ) {
    const filter: Record<string, unknown> = {};
    if (!includeInactive) {
      filter.isActive = true;
    }

    if (categoryId && Types.ObjectId.isValid(categoryId)) {
      filter.categoryId = new Types.ObjectId(categoryId);
    }

    if (search && search.trim().length > 0) {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      filter.$or = [{ name: regex }, { sku: regex }, { barcode: regex }];
    }

    return this.productModel.find(filter).sort({ name: 1 }).lean();
  }

  /**
   * Optimizado para lectores láser/Bluetooth (HID) y cámaras móviles (MLKit / ZXing):
   * 1. Limpia caracteres de control (\r, \n, espacios) que inyectan los lectores físicos.
   * 2. Usa el índice B-Tree único { barcode: 1 } (O(log n))incluyendo variantes EAN-13 / GTIN-14 (cero inicial).
   * 3. Si no coincide por EAN-13, hace fallback instantáneo al índice único { sku: 1 } (Codigo corto del Excel, ej. "297").
   */
  async findByBarcode(rawCode: string) {
    const cleanCode = rawCode.replace(/[\r\n\s]+/g, '').trim();
    if (!cleanCode) {
      throw new BadRequestException('Código de barras vacío');
    }

    const barcodeCandidates = new Set<string>([cleanCode]);
    if (cleanCode.startsWith('0') && cleanCode.length === 14) {
      barcodeCandidates.add(cleanCode.slice(1)); // GTIN-14 -> EAN-13
    } else if (cleanCode.length === 12) {
      barcodeCandidates.add(`0${cleanCode}`); // UPC-A -> EAN-13
    }

    let product = await this.productModel
      .findOne({
        barcode: { $in: Array.from(barcodeCandidates) },
        isActive: true,
      })
      .lean();

    // Fallback al Código corto del Excel (SKU) para productos sin etiqueta EAN (ej. Codigo 297)
    if (!product) {
      product = await this.productModel
        .findOne({
          sku: cleanCode.toUpperCase(),
          isActive: true,
        })
        .lean();
    }

    if (!product) {
      throw new NotFoundException({
        code: 'PRODUCT_BARCODE_NOT_FOUND',
        message: `No se encontró ningún producto activo con el código de barras o SKU "${cleanCode}"`,
      });
    }
    return product;
  }

  async updateProduct(id: string, dto: UpdateProductDto) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('ID de producto inválido');
    }

    const updatePayload: Record<string, unknown> = { ...dto };
    if (dto.categoryId) {
      if (!Types.ObjectId.isValid(dto.categoryId)) {
        throw new BadRequestException('categoryId inválido');
      }
      updatePayload.categoryId = new Types.ObjectId(dto.categoryId);
    }
    if (dto.priceCents !== undefined) {
      updatePayload.price = dto.priceCents;
    }

    const updated = await this.productModel
      .findByIdAndUpdate(id, { $set: updatePayload }, { new: true })
      .lean();

    if (!updated) {
      throw new NotFoundException('Producto no encontrado');
    }
    return updated;
  }

  async deleteProduct(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('ID de producto inválido');
    }

    const updated = await this.productModel
      .findByIdAndUpdate(id, { $set: { isActive: false } }, { new: true })
      .lean();

    if (!updated) {
      throw new NotFoundException('Producto no encontrado');
    }

    return {
      success: true,
      message: `Producto "${updated.name}" desactivado correctamente`,
    };
  }
}
