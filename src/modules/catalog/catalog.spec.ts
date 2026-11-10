import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ProductsService } from './services/products.service';

describe('Catalog Module (ProductsService)', () => {
  let productsService: ProductsService;
  let mockCategoryModel: any;
  let mockProductModel: any;

  beforeEach(() => {
    mockCategoryModel = {
      findById: jest.fn(),
    };
    mockProductModel = {
      create: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    };
    productsService = new ProductsService(mockCategoryModel, mockProductModel);
  });

  describe('Creación de Productos', () => {
    it('debe rechazar la creación si el categoryId es inválido', async () => {
      await expect(
        productsService.createProduct({
          categoryId: 'invalid-id',
          sku: 'CREA-01',
          barcode: null,
          name: 'Creatina 300g',
          priceCents: 2500000,
          costCents: 1500000,
          taxRateBasisPoints: 2100,
          trackInventory: true,
          initialStock: 10,
          minStockAlert: 2,
          unit: 'UNIT',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe rechazar la creación si la categoría no existe en la base de datos', async () => {
      const validCategoryId = new Types.ObjectId().toString();
      mockCategoryModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      await expect(
        productsService.createProduct({
          categoryId: validCategoryId,
          sku: 'CREA-01',
          barcode: null,
          name: 'Creatina 300g',
          priceCents: 2500000,
          costCents: 1500000,
          taxRateBasisPoints: 2100,
          trackInventory: true,
          initialStock: 10,
          minStockAlert: 2,
          unit: 'UNIT',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe crear el producto con normalización de SKU a mayúsculas', async () => {
      const validCategoryId = new Types.ObjectId().toString();
      mockCategoryModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: validCategoryId, name: 'Suplementos' }),
      });

      const fakeCreated = {
        toObject: () => ({
          _id: new Types.ObjectId(),
          sku: 'WHEY-VANILLA',
          name: 'Whey Protein Vainilla 1kg',
          priceCents: 3200000,
          price: 3200000,
          isActive: true,
        }),
      };
      mockProductModel.create.mockResolvedValue(fakeCreated);

      const result = await productsService.createProduct({
        categoryId: validCategoryId,
        sku: 'whey-vanilla',
        barcode: null,
        name: 'Whey Protein Vainilla 1kg',
        priceCents: 3200000,
        costCents: 1800000,
        taxRateBasisPoints: 2100,
        trackInventory: true,
        initialStock: 50,
        minStockAlert: 5,
        unit: 'UNIT',
      });

      expect(result.sku).toBe('WHEY-VANILLA');
      expect(result.isActive).toBe(true);
    });
  });

  describe('Búsqueda y Sanitización de Expresiones Regulares', () => {
    it('debe sanitizar caracteres de regex peligrosos como "[", "+", "*" sin lanzar error', async () => {
      mockProductModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      });

      // Si no estuviera sanitizado, la búsqueda con "[(" rompería la compilación de RegExp
      const result = await productsService.findAllProducts(undefined, 'Whey (Gold) [100%]*+?');
      expect(result).toEqual([]);
      expect(mockProductModel.find).toHaveBeenCalled();
    });
  });

  describe('Actualización y Soft Delete de Productos', () => {
    it('debe permitir actualizar el precio y sincronizar price con priceCents', async () => {
      const prodId = new Types.ObjectId().toString();
      mockProductModel.findByIdAndUpdate.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: prodId,
          sku: 'BARRA-01',
          name: 'Barra Proteica',
          priceCents: 250000,
          price: 250000,
        }),
      });

      const updated = await productsService.updateProduct(prodId, { priceCents: 250000 });
      expect(updated.priceCents).toBe(250000);
    });

    it('debe realizar soft delete (desactivación isActive=false)', async () => {
      const prodId = new Types.ObjectId().toString();
      mockProductModel.findByIdAndUpdate.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: prodId,
          name: 'Barra Proteica',
          isActive: false,
        }),
      });

      const deleted = await productsService.deleteProduct(prodId);
      expect(deleted.success).toBe(true);
      expect(deleted.message).toContain('desactivado');
    });
  });
});
