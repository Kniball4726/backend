import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Category, CategoryDocument } from '../schemas/category.schema';
import { Product, ProductDocument } from '../schemas/product.schema';

@Injectable()
export class CatalogSyncService {
  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
  ) {}

  async syncCatalogDelta(updatedSince?: string) {
    const serverTime = new Date();
    const filter: Record<string, unknown> = {};

    if (updatedSince) {
      const parsedDate = new Date(updatedSince);
      if (isNaN(parsedDate.getTime())) {
        throw new BadRequestException(
          'El parámetro updatedSince debe ser una fecha ISO-8601 válida',
        );
      }
      filter.updatedAt = { $gt: parsedDate };
    }

    const [categories, products] = await Promise.all([
      this.categoryModel.find(filter).sort({ updatedAt: 1, _id: 1 }).lean(),
      this.productModel.find(filter).sort({ updatedAt: 1, _id: 1 }).lean(),
    ]);

    return {
      serverTimestamp: serverTime.toISOString(),
      isDelta: Boolean(updatedSince),
      counts: {
        categories: categories.length,
        products: products.length,
      },
      categories,
      products,
    };
  }
}
