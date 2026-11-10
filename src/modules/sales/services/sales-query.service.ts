import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import {
  AuthenticatedUser,
  UserRole,
} from '../../../common/enums/role.enum';
import { COLLECTION_NAMES } from '../../../database/json-schemas/constants';
import { Sale, SaleDocument } from '../schemas/sale.schema';

@Injectable()
export class SalesQueryService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Sale.name) private readonly saleModel: Model<SaleDocument>,
  ) {}

  /**
   * Lista ventas aplicando aislamiento por rol:
   * - Rol CASHIER: ve exclusivamente sus propias ventas (filtradas por cashierId).
   * - Rol ADMIN / MASTER: ve todas las ventas o puede filtrar por cashierId.
   */
  async findAllSales(
    limit = 50,
    user?: AuthenticatedUser,
    targetCashierId?: string,
    activeRegisterOnly = false,
  ) {
    const filter: Record<string, unknown> = {};
    if (user?.role === UserRole.CASHIER && Types.ObjectId.isValid(user.sub)) {
      filter.cashierId = new Types.ObjectId(user.sub);
    } else if (targetCashierId && Types.ObjectId.isValid(targetCashierId)) {
      filter.cashierId = new Types.ObjectId(targetCashierId);
    }

    if (activeRegisterOnly && this.connection?.db) {
      const cashierToCheck =
        user?.role === UserRole.CASHIER ? user.sub : targetCashierId;
      if (cashierToCheck && Types.ObjectId.isValid(cashierToCheck)) {
        const openReg = await this.connection.db
          .collection(COLLECTION_NAMES.CASH_REGISTERS)
          .findOne({
            userId: new Types.ObjectId(cashierToCheck),
            status: 'ABIERTA',
            boxType: 'Ventas Sucursal',
          });

        if (!openReg) {
          // Si el vendedor no tiene caja abierta activa, sus ventas activas son 0
          return [];
        }

        const openDate =
          openReg.openedAt instanceof Date
            ? openReg.openedAt
            : new Date(String(openReg.openedAt));

        filter.$or = [
          { registerId: openReg._id },
          {
            cashierId: new Types.ObjectId(cashierToCheck),
            createdAt: { $gte: openDate },
          },
        ];
      }
    }

    const sales = await this.saleModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 200))
      .lean();

    if (!this.connection?.db || sales.length === 0) {
      return sales;
    }

    const cashierIds = Array.from(
      new Set(
        sales
          .map((s: any) => (s.cashierId ? s.cashierId.toString() : null))
          .filter(Boolean),
      ),
    ).map((id) => new Types.ObjectId(id as string));

    const cashiers =
      cashierIds.length > 0
        ? await this.connection.db
            .collection('users')
            .find(
              { _id: { $in: cashierIds } },
              { projection: { fullName: 1, email: 1, branch: 1, role: 1 } },
            )
            .toArray()
        : [];

    const cashierMap = new Map(
      cashiers.map((c: any) => [
        c._id.toString(),
        {
          id: c._id.toString(),
          fullName: c.fullName,
          email: c.email,
          branch: c.branch || 'LOCALES',
          role: c.role,
        },
      ]),
    );

    return sales.map((s: any) => ({
      ...s,
      cashierSnapshot: s.cashierId
        ? cashierMap.get(s.cashierId.toString()) || null
        : null,
    }));
  }

  async findByReceiptNumber(
    receiptNumber: string,
    user?: AuthenticatedUser,
  ) {
    const sale = await this.saleModel
      .findOne({ receiptNumber: receiptNumber.trim().toUpperCase() })
      .lean();
    if (!sale) {
      throw new NotFoundException(`Ticket "${receiptNumber}" no encontrado`);
    }

    if (
      user?.role === UserRole.CASHIER &&
      sale.cashierId &&
      sale.cashierId.toString() !== user.sub
    ) {
      throw new ForbiddenException(
        'No tienes permiso para consultar comprobantes de ventas de otro vendedor.',
      );
    }

    return sale;
  }
}
