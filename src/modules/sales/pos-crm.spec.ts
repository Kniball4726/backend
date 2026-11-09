import { Types } from 'mongoose';
import {
  COLLECTION_NAMES,
  MONGO_COLLECTION_SCHEMAS,
} from '../../database/json-schemas/collections.json-schema';
import { MONGO_COLLECTION_INDEXES } from '../../database/indexes/collections.indexes';
import { CrmService } from '../crm/crm.service';
import { ProductsService } from '../catalog/services/products.service';
import {
  calculateSaleTotals,
  generateReceiptNumber,
} from './domain/sale-pricing.calculator';
import { SalesService } from './sales.service';

describe('POS + CRM (DB-First & Mobile-First Architecture)', () => {
  describe('Escáner de Código de Barras (Lector Físico HID y Cámara Móvil)', () => {
    it('debe limpiar caracteres de lector físico (\\r\\n), normalizar GTIN-14/EAN-13 y hacer fallback por SKU corto', async () => {
      const mockProduct = {
        sku: '2537',
        name: 'Gel energy frutilla x 32 gr',
        price: 1870,
        barcode: '7798139076012',
      };

      const mockProductModel = {
        findOne: jest.fn().mockImplementation((filter: Record<string, unknown>) => ({
          lean: jest.fn().mockImplementation(async () => {
            const bcFilter = filter.barcode as { $in?: string[] } | undefined;
            if (bcFilter?.$in?.includes('7798139076012')) {
              return mockProduct;
            }
            if (filter.sku === '297') {
              return {
                sku: '297',
                name: 'Muscle Protein Bar - 100 g Chocolate',
                price: 7360,
                barcode: null,
              };
            }
            return null;
          }),
        })),
      };

      const productsService = new ProductsService(
        {} as never,
        mockProductModel as never,
      );

      // 1. Lector físico Bluetooth/USB enviando sufijo Enter (\r\n) y cámara enviando GTIN-14 con 0 inicial
      const fromScanner = await productsService.findByBarcode(
        '07798139076012\r\n',
      );
      expect(fromScanner.sku).toBe('2537');

      // 2. Fallback por código corto (SKU 297 que no tiene código de barras en el Excel)
      const fromShortSku = await productsService.findByBarcode('297');
      expect(fromShortSku.name).toBe('Muscle Protein Bar - 100 g Chocolate');
    });
  });
  describe('Calculadora de Dominio de Ventas (sale-pricing.calculator)', () => {
    it('debe calcular centavos exactos sin errores de punto flotante y generar folios válidos', () => {
      const totals = calculateSaleTotals({
        subtotalCents: 10000,
        rawTaxCents: 1600,
        discountPercentageApplied: 25,
      });

      expect(totals.discountCents).toBe(2500);
      expect(totals.taxCents).toBe(1200);
      expect(totals.totalCents).toBe(8700);

      const folio = generateReceiptNumber(new Date('2026-11-09T12:00:00Z'));
      expect(folio).toMatch(/^POS-20261109-[A-F0-9]{6}$/);
    });
  });
  describe('Capa DB-First ($jsonSchema e Índices)', () => {
    it('debe definir las 12 colecciones core, tesorería y master con validación estricta $jsonSchema', () => {
      const names = MONGO_COLLECTION_SCHEMAS.map((c) => c.name);
      expect(names).toEqual([
        COLLECTION_NAMES.USERS,
        COLLECTION_NAMES.CUSTOMERS,
        COLLECTION_NAMES.CATEGORIES,
        COLLECTION_NAMES.PRODUCTS,
        COLLECTION_NAMES.INVENTORY_MOVEMENTS,
        COLLECTION_NAMES.SALES,
        COLLECTION_NAMES.CASH_REGISTERS,
        COLLECTION_NAMES.CASH_OPERATIONS,
        COLLECTION_NAMES.API_KEYS,
        COLLECTION_NAMES.SYSTEM_SETTINGS,
        COLLECTION_NAMES.WEBHOOKS,
        COLLECTION_NAMES.AUDIT_LOGS,
      ]);

      for (const schema of MONGO_COLLECTION_SCHEMAS) {
        expect(schema.validationLevel).toBe('strict');
        expect(schema.validationAction).toBe('error');
        expect(schema.validator).toHaveProperty('$jsonSchema');
      }
    });

    it('debe requerir fullName, email y activeDiscount en la colección customers del CRM', () => {
      const customersSchema = MONGO_COLLECTION_SCHEMAS.find(
        (c) => c.name === COLLECTION_NAMES.CUSTOMERS,
      );
      const jsonSchema = customersSchema?.validator.$jsonSchema as {
        required: string[];
      };
      expect(jsonSchema.required).toEqual(
        expect.arrayContaining([
          'fullName',
          'email',
          'activeDiscount',
          'createdAt',
          'updatedAt',
        ]),
      );
    });

    it('debe incluir índices únicos para email en CRM e idempotencyKey en ventas', () => {
      const customerEmailIdx = MONGO_COLLECTION_INDEXES.find(
        (i) =>
          i.collection === COLLECTION_NAMES.CUSTOMERS &&
          i.options.name === 'idx_customers_email_unique',
      );
      const saleIdempotencyIdx = MONGO_COLLECTION_INDEXES.find(
        (i) =>
          i.collection === COLLECTION_NAMES.SALES &&
          i.options.name === 'idx_sales_idempotency_unique',
      );

      expect(customerEmailIdx?.options.unique).toBe(true);
      expect(saleIdempotencyIdx?.options.unique).toBe(true);
    });
  });

  describe('Flujo CRM -> Cotización de Venta con Descuento de 1 Uso', () => {
    it('debe registrar fecha/hora automáticamente al cargar un cliente con descuento en CRM', async () => {
      const createdMock = {
        _id: new Types.ObjectId(),
        fullName: 'Carlos Ruiz',
        email: 'carlos.ruiz@correo.com',
        activeDiscount: {
          isAvailable: true,
          percentage: 20,
          assignedAt: new Date(),
          assignedByUserId: new Types.ObjectId(),
          consumedAt: null,
          consumedInSaleNumber: null,
        },
        discountHistory: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockCustomerModel = {
        findOne: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
        create: jest.fn().mockImplementation(async (doc) => ({
          toObject: () => ({
            ...createdMock,
            ...doc,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        })),
      };

      const crmService = new CrmService(mockCustomerModel as never);
      const crmUserId = new Types.ObjectId().toString();

      const result = await crmService.registerCustomerWithDiscount(
        {
          fullName: 'Carlos Ruiz',
          email: 'carlos.ruiz@correo.com',
          discountPercentage: 20,
        },
        crmUserId,
      );

      expect(result.fullName).toBe('Carlos Ruiz');
      expect(result.email).toBe('carlos.ruiz@correo.com');
      expect(result.activeDiscount.isAvailable).toBe(true);
      expect(result.activeDiscount.percentage).toBe(20);
      expect(result.activeDiscount.assignedAt).toBeInstanceOf(Date);
    });

    it('debe aplicar el porcentaje de descuento del CRM sobre la compra al cotizar en el POS', async () => {
      const productId = new Types.ObjectId();
      const customerId = new Types.ObjectId();

      const mockProductModel = {
        find: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            {
              _id: productId,
              sku: 'PROD-100',
              name: 'Producto Prueba',
              priceCents: 10000, // $100.00
              taxRateBasisPoints: 1600, // 16%
              trackInventory: true,
              stock: 10,
              isActive: true,
            },
          ]),
        }),
      };

      const mockCrmService = {
        findById: jest.fn().mockResolvedValue({
          _id: customerId,
          fullName: 'Cliente Con Descuento',
          email: 'cliente@crm.com',
          activeDiscount: {
            isAvailable: true,
            percentage: 15, // 15% cargado por el rol CRM
          },
        }),
      };

      const salesService = new SalesService(
        {} as never,
        {} as never,
        mockProductModel as never,
        {} as never,
        mockCrmService as never,
      );

      const preview = await salesService.previewSale({
        items: [{ productId: productId.toString(), quantity: 2 }],
        customerId: customerId.toString(),
        applyCustomerDiscount: true,
      });

      // Subtotal: 2 * $100.00 = $200.00 (20000 centavos)
      // Descuento 15%: $30.00 (3000 centavos)
      // Base tras descuento: $170.00 (17000 centavos)
      // IVA 16% sobre $170.00: $27.20 (2720 centavos)
      // Total final: $197.20 (19720 centavos)
      expect(preview.subtotalCents).toBe(20000);
      expect(preview.discountPercentageApplied).toBe(15);
      expect(preview.discountCents).toBe(3000);
      expect(preview.taxCents).toBe(2720);
      expect(preview.totalCents).toBe(19720);
    });
  });
});
