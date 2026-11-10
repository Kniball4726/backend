import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { AuthenticatedUser, UserRole } from '../../../common/enums/role.enum';
import { COLLECTION_NAMES } from '../../../database/json-schemas/constants';

@Injectable()
export class TreasurySummaryService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  private get db() {
    if (!this.connection.db) {
      throw new ServiceUnavailableException('Base de datos no conectada');
    }
    return this.connection.db;
  }

  /**
   * Obtiene el arqueo y resumen de ventas agrupado por cada forma de pago para una caja.
   */
  async getRegisterSummary(
    registerId: string,
    user: AuthenticatedUser,
    declaredCash?: number,
    existingRegisterDoc?: Record<string, unknown>,
  ) {
    if (!Types.ObjectId.isValid(registerId)) {
      throw new BadRequestException('ID de caja inválido');
    }

    const regObjId = new Types.ObjectId(registerId);
    const registersCol = this.db.collection(COLLECTION_NAMES.CASH_REGISTERS);
    const existing =
      existingRegisterDoc ?? (await registersCol.findOne({ _id: regObjId }));

    if (!existing) {
      throw new NotFoundException('Caja no encontrada');
    }

    if (
      user.role === UserRole.CASHIER &&
      existing.userId &&
      existing.userId.toString() !== user.sub
    ) {
      throw new ForbiddenException(
        'No tienes permiso para ver el resumen de caja de otro vendedor.',
      );
    }

    const openedAt =
      existing.openedAt instanceof Date
        ? existing.openedAt
        : new Date(String(existing.openedAt));
    const closedAt = existing.closedAt
      ? existing.closedAt instanceof Date
        ? existing.closedAt
        : new Date(String(existing.closedAt))
      : new Date();

    // 1. Agrupar ventas asociadas a la caja
    const salesCol = this.db.collection(COLLECTION_NAMES.SALES);
    const salesFilter: Record<string, unknown> = {
      status: 'COMPLETED',
      $or: [
        { registerId: regObjId },
        {
          cashierId: existing.userId,
          createdAt: { $gte: openedAt, $lte: closedAt },
        },
      ],
    };

    const salesCursor = salesCol?.find?.(salesFilter);
    const sales =
      salesCursor && typeof salesCursor.toArray === 'function'
        ? await salesCursor.toArray()
        : [];

    let cashSalesCents = 0;
    let cardSalesCents = 0;
    let qrMpSalesCents = 0;
    let qrScSalesCents = 0;
    let canjesSalesCents = 0;
    let otherSalesCents = 0;
    let totalSalesCents = 0;

    for (const sale of sales) {
      const saleTotal = Number(sale.totalCents || 0);
      totalSalesCents += saleTotal;

      const payments = Array.isArray(sale.payments)
        ? sale.payments
        : Array.isArray(sale.paymentMethods)
          ? sale.paymentMethods
          : [];

      if (payments.length > 0) {
        for (const pm of payments) {
          const amt = Number(pm.amountCents || 0);
          const ref = String(pm.reference || '').toUpperCase();
          const method = String(pm.method || '').toUpperCase();

          if (ref.includes('CANJE') || method === 'CANJE') {
            canjesSalesCents += amt;
          } else if (
            ref.includes('MERCADO PAGO') ||
            ref.includes('MERCADOPAGO') ||
            ref.includes('QR MP') ||
            method === 'QR_MERCADOPAGO'
          ) {
            qrMpSalesCents += amt;
          } else if (
            ref.includes('SPORT CLUB') ||
            ref.includes('SANTA FE') ||
            ref.includes('QR SC') ||
            method === 'QR_SANTA_FE'
          ) {
            qrScSalesCents += amt;
          } else if (
            method === 'CARD' ||
            method === 'CARD_CREDIT' ||
            method === 'CARD_DEBIT' ||
            ref.includes('VISA') ||
            ref.includes('MASTERCARD')
          ) {
            cardSalesCents += amt;
          } else if (method === 'CASH') {
            cashSalesCents += amt;
          } else {
            otherSalesCents += amt;
          }
        }
      } else {
        cashSalesCents += saleTotal;
      }
    }

    // 2. Agrupar movimientos de caja (Ingresos extraordinarios, Egresos, Gastos)
    const opsCol = this.db.collection(COLLECTION_NAMES.CASH_OPERATIONS);
    const opsFilter: Record<string, unknown> = {
      $or: [
        { registerId: regObjId },
        {
          userId: existing.userId,
          createdAt: { $gte: openedAt, $lte: closedAt },
        },
      ],
    };

    const opsCursor = opsCol?.find?.(opsFilter);
    const ops =
      opsCursor && typeof opsCursor.toArray === 'function'
        ? await opsCursor.toArray()
        : [];

    let totalIncomesCents = 0;
    let totalWithdrawalsCents = 0;
    let totalExpensesCents = 0;

    for (const op of ops) {
      const amt = Number(op.amountCents || 0);
      if (op.type === 'INGRESO_EXTRAORDINARIO') {
        totalIncomesCents += amt;
      } else if (op.type === 'EGRESO_EXTRAORDINARIO') {
        totalWithdrawalsCents += amt;
      } else if (op.type === 'GASTO') {
        totalExpensesCents += amt;
      }
    }

    const initialBalanceCents = Number(existing.initialBalanceCents || 0);
    const expectedCashCents =
      initialBalanceCents +
      cashSalesCents +
      totalIncomesCents -
      totalWithdrawalsCents -
      totalExpensesCents;

    const declaredCashCents =
      typeof declaredCash === 'number'
        ? Math.round(declaredCash * 100)
        : ((existing.closureSummary as Record<string, unknown>)
            ?.declaredCashCents as number | undefined) ?? expectedCashCents;

    const differenceCents = declaredCashCents - expectedCashCents;

    return {
      registerId: String(existing._id),
      userFullName: String(existing.userFullName || 'Operador'),
      branch: String(existing.branch),
      boxType: String(existing.boxType),
      status: String(existing.status),
      openedAt: openedAt.toLocaleString('es-AR'),
      openedAtIso: openedAt.toISOString(),
      closedAt:
        existing.status === 'CERRADA' ? closedAt.toLocaleString('es-AR') : null,
      closedAtIso:
        existing.status === 'CERRADA' ? closedAt.toISOString() : null,
      totalSalesCount: sales.length,
      totalSalesCents,
      totalSales: Number((totalSalesCents / 100).toFixed(2)),
      totalsByMethod: {
        cashCents: cashSalesCents,
        cash: Number((cashSalesCents / 100).toFixed(2)),
        cardCents: cardSalesCents,
        card: Number((cardSalesCents / 100).toFixed(2)),
        qrMpCents: qrMpSalesCents,
        qrMp: Number((qrMpSalesCents / 100).toFixed(2)),
        qrScCents: qrScSalesCents,
        qrSc: Number((qrScSalesCents / 100).toFixed(2)),
        canjesCents: canjesSalesCents,
        canjes: Number((canjesSalesCents / 100).toFixed(2)),
        otherCents: otherSalesCents,
        other: Number((otherSalesCents / 100).toFixed(2)),
      },
      operationsSummary: {
        incomesCents: totalIncomesCents,
        incomes: Number((totalIncomesCents / 100).toFixed(2)),
        withdrawalsCents: totalWithdrawalsCents,
        withdrawals: Number((totalWithdrawalsCents / 100).toFixed(2)),
        expensesCents: totalExpensesCents,
        expenses: Number((totalExpensesCents / 100).toFixed(2)),
      },
      initialBalanceCents,
      initialBalance: Number((initialBalanceCents / 100).toFixed(2)),
      expectedCashCents,
      expectedCash: Number((expectedCashCents / 100).toFixed(2)),
      declaredCashCents,
      declaredCash: Number((declaredCashCents / 100).toFixed(2)),
      differenceCents,
      difference: Number((differenceCents / 100).toFixed(2)),
    };
  }
}
