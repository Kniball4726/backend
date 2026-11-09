import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { Category, CategorySchema } from './schemas/category.schema';
import { Product, ProductSchema } from './schemas/product.schema';
import { CatalogSyncService } from './services/catalog-sync.service';
import { CategoriesService } from './services/categories.service';
import { ProductsService } from './services/products.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Category.name, schema: CategorySchema },
      { name: Product.name, schema: ProductSchema },
    ]),
  ],
  controllers: [CatalogController],
  providers: [
    CategoriesService,
    ProductsService,
    CatalogSyncService,
    CatalogService,
  ],
  exports: [
    CategoriesService,
    ProductsService,
    CatalogSyncService,
    CatalogService,
    MongooseModule,
  ],
})
export class CatalogModule {}
