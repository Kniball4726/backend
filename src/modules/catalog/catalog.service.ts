import { Injectable } from '@nestjs/common';
import {
  CreateCategoryDto,
  CreateProductDto,
  UpdateProductDto,
} from './dto/catalog.dto';
import { CatalogSyncService } from './services/catalog-sync.service';
import { CategoriesService } from './services/categories.service';
import { ProductsService } from './services/products.service';

@Injectable()
export class CatalogService {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly productsService: ProductsService,
    private readonly catalogSyncService: CatalogSyncService,
  ) {}

  createCategory(dto: CreateCategoryDto) {
    return this.categoriesService.createCategory(dto);
  }

  findAllCategories() {
    return this.categoriesService.findAllCategories();
  }

  createProduct(dto: CreateProductDto) {
    return this.productsService.createProduct(dto);
  }

  findAllProducts(categoryId?: string, search?: string) {
    return this.productsService.findAllProducts(categoryId, search);
  }

  findByBarcode(barcode: string) {
    return this.productsService.findByBarcode(barcode);
  }

  updateProduct(id: string, dto: UpdateProductDto) {
    return this.productsService.updateProduct(id, dto);
  }

  syncCatalogDelta(updatedSince?: string) {
    return this.catalogSyncService.syncCatalogDelta(updatedSince);
  }
}
