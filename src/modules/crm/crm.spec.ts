import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { Types } from 'mongoose';
import { CrmService } from './crm.service';

describe('CRM Module (CrmService)', () => {
  let crmService: CrmService;
  let mockCustomerModel: any;
  let mockMasterService: any;

  beforeEach(() => {
    mockCustomerModel = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
    };
    mockMasterService = {
      getSettings: jest.fn().mockResolvedValue({
        maxCrmDiscountPercentage: 30,
        maintenanceMode: { crmPaused: false },
      }),
      dispatchWebhookEvent: jest.fn().mockResolvedValue(undefined),
    };
    crmService = new CrmService(mockCustomerModel, mockMasterService);
  });

  describe('Validación de Descuentos y Reglas Master', () => {
    it('debe rechazar un descuento si supera el tope configurado por MASTER (ej. 35% > 30%)', async () => {
      await expect(
        crmService.registerCustomerWithDiscount(
          {
            email: 'cliente@ejemplo.com',
            fullName: 'Cliente VIP',
            discountPercentage: 35,
          },
          new Types.ObjectId().toString(),
          'LOCALES',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe rechazar la operación si el módulo CRM está pausado en mantenimiento por MASTER', async () => {
      mockMasterService.getSettings.mockResolvedValueOnce({
        maxCrmDiscountPercentage: 30,
        maintenanceMode: {
          crmPaused: true,
          reason: 'Mantenimiento preventivo de bases de datos',
        },
      });

      await expect(
        crmService.registerCustomerWithDiscount(
          {
            email: 'cliente@ejemplo.com',
            fullName: 'Cliente VIP',
            discountPercentage: 15,
          },
          new Types.ObjectId().toString(),
          'LOCALES',
        ),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('debe registrar o actualizar exitosamente un cliente con sucursal y descuento válido', async () => {
      const customerDoc = {
        email: 'cliente@ejemplo.com',
        fullName: 'Cliente VIP',
        branch: 'LOCALES',
        activeDiscount: { isAvailable: false, percentage: 0 },
        discountHistory: [],
        save: jest.fn().mockResolvedValue(true),
        toObject: function () {
          return {
            _id: new Types.ObjectId(),
            email: this.email,
            fullName: this.fullName,
            branch: this.branch,
            activeDiscount: this.activeDiscount,
          };
        },
      };

      mockCustomerModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(customerDoc),
      });

      const res = await crmService.registerCustomerWithDiscount(
        {
          email: 'cliente@ejemplo.com',
          fullName: 'Cliente VIP',
          discountPercentage: 20,
        },
        new Types.ObjectId().toString(),
        'LOCALES',
      );

      expect(res.branch).toBe('LOCALES');
      expect(customerDoc.activeDiscount.percentage).toBe(20);
      expect(customerDoc.activeDiscount.isAvailable).toBe(true);
      expect(customerDoc.save).toHaveBeenCalled();
    });
  });
});
