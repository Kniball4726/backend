import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { BranchName, UserRole } from '../../common/enums/role.enum';
import { TreasuryService } from './treasury.service';

describe('Treasury Module (TreasuryService)', () => {
  let treasuryService: TreasuryService;
  let mockRegistersCol: any;
  let mockOperationsCol: any;
  let mockSalesCol: any;

  beforeEach(() => {
    mockRegistersCol = {
      find: jest.fn(),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      insertOne: jest.fn(),
      aggregate: jest.fn(),
    };
    mockOperationsCol = {
      find: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }),
      findOne: jest.fn(),
      insertOne: jest.fn(),
    };
    mockSalesCol = {
      find: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }),
    };

    const mockDb = {
      collection: jest.fn().mockImplementation((name: string) => {
        if (name === 'cash_registers') return mockRegistersCol;
        if (name === 'cash_operations') return mockOperationsCol;
        if (name === 'sales') return mockSalesCol;
        return mockRegistersCol;
      }),
    };

    const mockConnection = { db: mockDb };
    treasuryService = new TreasuryService(mockConnection as any);
  });

  describe('Apertura de Cajas (openRegister)', () => {
    it('debe rechazar la apertura de caja si el cajero ya tiene una caja abierta en su sucursal', async () => {
      const cashierSub = new Types.ObjectId().toString();
      const user = {
        sub: cashierSub,
        email: 'cajero@justimobile.com',
        fullName: 'Daniel Cajero',
        role: UserRole.CASHIER,
        branch: BranchName.LOCALES,
      };

      // Sin caja consolidada abierta
      mockRegistersCol.findOne.mockResolvedValueOnce(null);
      // Pero YA tiene su propia caja abierta
      mockRegistersCol.findOne.mockResolvedValueOnce({
        _id: new Types.ObjectId(),
        userId: new Types.ObjectId(cashierSub),
        status: 'ABIERTA',
        boxType: 'Ventas Sucursal',
      });

      await expect(
        treasuryService.openRegister(
          {
            boxType: 'Ventas Sucursal',
            branch: BranchName.LOCALES,
            observations: 'Intento de abrir segunda caja',
          },
          user,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe impedir abrir una Caja Consolidada si todavía existen cajas abiertas en la sucursal', async () => {
      const adminUser = {
        sub: new Types.ObjectId().toString(),
        email: 'admin@justimobile.com',
        fullName: 'Admin',
        role: UserRole.ADMIN,
        branch: BranchName.LOCALES,
      };

      // findOne devuelve una caja abierta existente
      mockRegistersCol.findOne.mockResolvedValueOnce({
        _id: new Types.ObjectId(),
        status: 'ABIERTA',
        branch: BranchName.LOCALES,
      });

      await expect(
        treasuryService.openRegister(
          {
            boxType: 'Caja Consolidada',
            branch: BranchName.LOCALES,
            observations: 'Cierre consolidado',
          },
          adminUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe abrir una caja de Ventas Sucursal con saldo 0 correctamente', async () => {
      const cashierSub = new Types.ObjectId().toString();
      const user = {
        sub: cashierSub,
        email: 'cajero@justimobile.com',
        fullName: 'Daniel Cajero',
        role: UserRole.CASHIER,
        branch: BranchName.LOCALES,
      };

      mockRegistersCol.findOne.mockResolvedValue(null);
      mockRegistersCol.insertOne.mockResolvedValue({ acknowledged: true });

      const reg = await treasuryService.openRegister(
        {
          boxType: 'Ventas Sucursal',
          branch: BranchName.LOCALES,
          observations: 'Turno Mañana',
        },
        user,
      );

      expect(reg.boxType).toBe('Ventas Sucursal');
      expect(reg.status).toBe('ABIERTA');
      expect(reg.branch).toBe(BranchName.LOCALES);
      expect(reg.initialBalance).toBe(0);
    });
  });

  describe('Cierre de Cajas (closeRegister)', () => {
    it('debe impedir que un cajero cierre la caja de otro vendedor', async () => {
      const cashier1Sub = new Types.ObjectId().toString();
      const cashier2Sub = new Types.ObjectId().toString();
      const regId = new Types.ObjectId().toString();

      const user = {
        sub: cashier1Sub,
        email: 'cajero1@justimobile.com',
        fullName: 'Cajero 1',
        role: UserRole.CASHIER,
        branch: BranchName.LOCALES,
      };

      // La caja pertenece al cajero 2
      mockRegistersCol.findOne.mockResolvedValueOnce({
        _id: new Types.ObjectId(regId),
        userId: new Types.ObjectId(cashier2Sub),
        status: 'ABIERTA',
        boxType: 'Ventas Sucursal',
      });

      await expect(treasuryService.closeRegister(regId, user)).rejects.toThrow(ForbiddenException);
    });

    it('debe permitir a un ADMIN cerrar cualquier caja abierta de la sucursal', async () => {
      const regId = new Types.ObjectId().toString();
      const adminUser = {
        sub: new Types.ObjectId().toString(),
        email: 'admin@justimobile.com',
        fullName: 'Admin',
        role: UserRole.ADMIN,
        branch: BranchName.LOCALES,
      };

      const now = new Date();
      mockRegistersCol.findOne.mockResolvedValueOnce({
        _id: new Types.ObjectId(regId),
        userId: new Types.ObjectId(),
        status: 'ABIERTA',
        openedAt: now,
      });

      mockRegistersCol.findOneAndUpdate.mockResolvedValueOnce({
        _id: new Types.ObjectId(regId),
        status: 'CERRADA',
        openedAt: now,
        closedAt: now,
      });

      const closed = await treasuryService.closeRegister(regId, adminUser);
      expect(closed.status).toBe('CERRADA');
    });

    it('debe calcular el resumen de totales por forma de pago al consultar o cerrar la caja', async () => {
      const regId = new Types.ObjectId().toString();
      const cashierSub = new Types.ObjectId().toString();
      const user = {
        sub: cashierSub,
        email: 'cajero@justimobile.com',
        fullName: 'Daniel Cajero',
        role: UserRole.CASHIER,
        branch: BranchName.LOCALES,
      };

      const now = new Date();
      mockRegistersCol.findOne.mockResolvedValueOnce({
        _id: new Types.ObjectId(regId),
        userId: new Types.ObjectId(cashierSub),
        userFullName: 'Daniel Cajero',
        branch: BranchName.LOCALES,
        boxType: 'Ventas Sucursal',
        status: 'ABIERTA',
        initialBalanceCents: 5000,
        openedAt: now,
      });

      // Ventas simuladas con diferentes métodos de pago
      mockSalesCol.find.mockReturnValueOnce({
        toArray: jest.fn().mockResolvedValue([
          {
            totalCents: 10000,
            payments: [{ method: 'CASH', amountCents: 10000, reference: '' }],
          },
          {
            totalCents: 15000,
            payments: [{ method: 'CARD', amountCents: 15000, reference: 'VISA 1234' }],
          },
          {
            totalCents: 8000,
            payments: [{ method: 'TRANSFER', amountCents: 8000, reference: 'QR MERCADO PAGO #999' }],
          },
          {
            totalCents: 4500,
            payments: [{ method: 'TRANSFER', amountCents: 4500, reference: 'QR SPORT CLUB #444' }],
          },
          {
            totalCents: 2000,
            payments: [{ method: 'CASH', amountCents: 2000, reference: 'CANJE PRODUCTO' }],
          },
        ]),
      });

      const summary = await treasuryService.getRegisterSummary(regId, user, 150);

      expect(summary.totalSalesCount).toBe(5);
      expect(summary.totalSalesCents).toBe(39500);
      expect(summary.totalsByMethod.cashCents).toBe(10000);
      expect(summary.totalsByMethod.cardCents).toBe(15000);
      expect(summary.totalsByMethod.qrMpCents).toBe(8000);
      expect(summary.totalsByMethod.qrScCents).toBe(4500);
      expect(summary.totalsByMethod.canjesCents).toBe(2000);
      expect(summary.initialBalanceCents).toBe(5000);
      expect(summary.expectedCashCents).toBe(15000); // 5000 inicial + 10000 efectivo
      expect(summary.declaredCashCents).toBe(15000); // 150 * 100
      expect(summary.differenceCents).toBe(0);
    });
  });
});
