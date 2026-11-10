import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { COLLECTION_NAMES } from '../../../database/json-schemas/constants';
import { Sale, SaleDocument } from '../schemas/sale.schema';

export interface BusinessIntelligenceMetrics {
  timeRange: 'today' | '7d' | '30d' | 'all';
  branch: string;
  generatedAt: string;
  summary: {
    totalRevenuePesos: number;
    totalTransactions: number;
    averageTicketPesos: number;
    totalItemsSold: number;
    totalDiscountsPesos: number;
    cancelledCount: number;
    cancelledRevenuePesos: number;
    totalExpensesPesos: number;
    operatingCashFlowPesos: number;
    digitalPaymentRatio: number;
  };
  dailyTrend: Array<{
    date: string;
    label: string;
    totalPesos: number;
    transactions: number;
    localesPesos: number;
    carrerasPesos: number;
  }>;
  paymentMix: Array<{
    method: string;
    label: string;
    totalPesos: number;
    count: number;
    percentage: number;
  }>;
  topProducts: Array<{
    productId: string;
    sku: string;
    name: string;
    unitsSold: number;
    totalRevenuePesos: number;
    sharePercentage: number;
  }>;
  branchBenchmark: {
    locales: {
      totalPesos: number;
      transactions: number;
      averageTicketPesos: number;
      sharePercentage: number;
    };
    carreras: {
      totalPesos: number;
      transactions: number;
      averageTicketPesos: number;
      sharePercentage: number;
    };
  };
  staffLeaderboard: Array<{
    cashierId: string;
    fullName: string;
    email: string;
    branch: string;
    totalSalesPesos: number;
    transactionsCount: number;
    averageTicketPesos: number;
  }>;
  crmInsights: {
    regularSalesCount: number;
    crmSalesCount: number;
    crmAdoptionRate: number;
    totalCrmDiscountPesos: number;
  };
}

@Injectable()
export class SalesBiService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Sale.name) private readonly saleModel: Model<SaleDocument>,
  ) {}

  /**
   * Genera el conjunto completo de métricas de Inteligencia de Negocios (BI)
   * agrupando datos de ventas, tesorería, formas de pago y CRM.
   */
  async getBusinessIntelligence(
    timeRange: 'today' | '7d' | '30d' | 'all' = '7d',
    branchFilter = 'ALL',
  ): Promise<BusinessIntelligenceMetrics> {
    const now = new Date();
    let startDate: Date | null = null;

    if (timeRange === 'today') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    } else if (timeRange === '7d') {
      startDate = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      startDate.setHours(0, 0, 0, 0);
    } else if (timeRange === '30d') {
      startDate = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
      startDate.setHours(0, 0, 0, 0);
    }

    // 1. Obtener usuarios para mapeo de cajero -> sucursal
    const userMap = new Map<string, { fullName: string; email: string; branch: string }>();
    if (this.connection?.db) {
      try {
        const users = await this.connection.db
          .collection(COLLECTION_NAMES.USERS)
          .find({}, { projection: { fullName: 1, email: 1, branch: 1 } })
          .toArray();

        for (const u of users) {
          userMap.set(String(u._id), {
            fullName: String(u.fullName || 'Operador'),
            email: String(u.email || ''),
            branch: String(u.branch || 'LOCALES').toUpperCase(),
          });
        }
      } catch {
        // Fallback silencioso si no se pueden leer usuarios
      }
    }

    // 2. Consultar ventas
    const salesQuery: Record<string, unknown> = {};
    if (startDate) {
      salesQuery.createdAt = { $gte: startDate };
    }

    const rawSales = await this.saleModel
      .find(salesQuery)
      .sort({ createdAt: 1 })
      .lean();

    // 3. Filtrar ventas por sucursal si corresponde
    const targetBranch = branchFilter.toUpperCase();
    const sales = rawSales.filter((s: any) => {
      if (targetBranch === 'ALL') return true;
      const cashierIdStr = s.cashierId ? String(s.cashierId) : '';
      const userInfo = userMap.get(cashierIdStr);
      const cashierBranch = userInfo?.branch || 'LOCALES';
      return cashierBranch === targetBranch;
    });

    // 4. Separar ventas completadas y anuladas
    const completedSales = sales.filter((s: any) => s.status !== 'CANCELLED');
    const cancelledSales = sales.filter((s: any) => s.status === 'CANCELLED');

    const totalRevenueCents = completedSales.reduce((acc, s: any) => acc + (s.totalCents || 0), 0);
    const totalRevenuePesos = Number((totalRevenueCents / 100).toFixed(2));
    const totalTransactions = completedSales.length;
    const averageTicketPesos =
      totalTransactions > 0
        ? Number((totalRevenuePesos / totalTransactions).toFixed(2))
        : 0;

    const totalDiscountsCents = completedSales.reduce((acc, s: any) => acc + (s.discountCents || 0), 0);
    const totalDiscountsPesos = Number((totalDiscountsCents / 100).toFixed(2));

    const totalItemsSold = completedSales.reduce((acc, s: any) => {
      const items = Array.isArray(s.items) ? s.items : [];
      return acc + items.reduce((iAcc: number, item: any) => iAcc + (item.quantity || 0), 0);
    }, 0);

    const cancelledCount = cancelledSales.length;
    const cancelledRevenueCents = cancelledSales.reduce((acc, s: any) => acc + (s.totalCents || 0), 0);
    const cancelledRevenuePesos = Number((cancelledRevenueCents / 100).toFixed(2));

    // 5. Consultar gastos de mostrador (Tesorería)
    let totalExpensesPesos = 0;
    if (this.connection?.db) {
      try {
        const opsQuery: Record<string, unknown> = {
          type: { $in: ['GASTO', 'EGRESO_EXTRAORDINARIO'] },
        };
        if (startDate) {
          opsQuery.createdAt = { $gte: startDate };
        }
        if (targetBranch !== 'ALL') {
          opsQuery.branch = targetBranch;
        }

        const operations = await this.connection.db
          .collection(COLLECTION_NAMES.CASH_OPERATIONS)
          .find(opsQuery)
          .toArray();

        const expensesCents = operations.reduce(
          (acc, op: any) => acc + (op.amountCents || Math.round((op.amount || 0) * 100)),
          0,
        );
        totalExpensesPesos = Number((expensesCents / 100).toFixed(2));
      } catch {
        // Fallback si no está disponible la colección de operaciones
      }
    }

    const operatingCashFlowPesos = Number((totalRevenuePesos - totalExpensesPesos).toFixed(2));

    // 6. Tendencia Temporal (Daily Trend)
    const dailyMap = new Map<
      string,
      { label: string; totalPesos: number; transactions: number; localesPesos: number; carrerasPesos: number }
    >();

    // Inicializar días en el rango para evitar huecos en el gráfico
    const daysCount = timeRange === 'today' ? 1 : timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 14;
    const baseDate = startDate || new Date(now.getTime() - (daysCount - 1) * 24 * 60 * 60 * 1000);

    for (let i = 0; i < daysCount; i++) {
      const d = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateKey = `${yyyy}-${mm}-${dd}`;
      const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
      const label = `${dayNames[d.getDay()]} ${dd}/${mm}`;
      dailyMap.set(dateKey, {
        label,
        totalPesos: 0,
        transactions: 0,
        localesPesos: 0,
        carrerasPesos: 0,
      });
    }

    for (const s of completedSales as any[]) {
      const sDate = s.createdAt instanceof Date ? s.createdAt : new Date(String(s.createdAt));
      const yyyy = sDate.getFullYear();
      const mm = String(sDate.getMonth() + 1).padStart(2, '0');
      const dd = String(sDate.getDate()).padStart(2, '0');
      const dateKey = `${yyyy}-${mm}-${dd}`;

      const amountPesos = (s.totalCents || 0) / 100;
      const cashierIdStr = s.cashierId ? String(s.cashierId) : '';
      const cBranch = userMap.get(cashierIdStr)?.branch || 'LOCALES';

      const entry = dailyMap.get(dateKey) || {
        label: `${dd}/${mm}`,
        totalPesos: 0,
        transactions: 0,
        localesPesos: 0,
        carrerasPesos: 0,
      };

      entry.totalPesos = Number((entry.totalPesos + amountPesos).toFixed(2));
      entry.transactions += 1;
      if (cBranch === 'CARRERAS') {
        entry.carrerasPesos = Number((entry.carrerasPesos + amountPesos).toFixed(2));
      } else {
        entry.localesPesos = Number((entry.localesPesos + amountPesos).toFixed(2));
      }
      dailyMap.set(dateKey, entry);
    }

    const dailyTrend = Array.from(dailyMap.entries()).map(([date, data]) => ({
      date,
      ...data,
    }));

    // 7. Desglose de Formas de Pago (Payment Mix)
    const methodMap = new Map<string, { label: string; totalPesos: number; count: number }>();
    let digitalRevenuePesos = 0;

    for (const s of completedSales as any[]) {
      const payments = Array.isArray(s.payments) ? s.payments : [];
      for (const p of payments) {
        const pAmount = (p.amountCents || 0) / 100;
        const refUpper = String(p.reference || '').toUpperCase();
        let key = 'EFECTIVO';
        let label = 'Efectivo';

        if (refUpper.startsWith('MP-') || refUpper.includes('MERCADO')) {
          key = 'MP_QR';
          label = 'QR Mercado Pago';
          digitalRevenuePesos += pAmount;
        } else if (refUpper.includes('SPORT') || refUpper.includes('GIMNASIO')) {
          key = 'SPORT_CLUB';
          label = 'QR Sport Club';
          digitalRevenuePesos += pAmount;
        } else if (p.method === 'CARD' || refUpper.includes('TARJETA') || refUpper.includes('POSNET')) {
          key = 'TARJETA';
          label = 'Tarjeta Débito / Crédito';
          digitalRevenuePesos += pAmount;
        } else if (p.method === 'CASH') {
          key = 'EFECTIVO';
          label = 'Efectivo';
        } else {
          key = 'OTROS';
          label = 'Otros / Canjes';
        }

        const current = methodMap.get(key) || { label, totalPesos: 0, count: 0 };
        current.totalPesos = Number((current.totalPesos + pAmount).toFixed(2));
        current.count += 1;
        methodMap.set(key, current);
      }
    }

    const paymentMix = Array.from(methodMap.entries())
      .map(([method, data]) => ({
        method,
        label: data.label,
        totalPesos: data.totalPesos,
        count: data.count,
        percentage:
          totalRevenuePesos > 0
            ? Number(((data.totalPesos / totalRevenuePesos) * 100).toFixed(1))
            : 0,
      }))
      .sort((a, b) => b.totalPesos - a.totalPesos);

    const digitalPaymentRatio =
      totalRevenuePesos > 0
        ? Number(((digitalRevenuePesos / totalRevenuePesos) * 100).toFixed(1))
        : 0;

    // 8. Top Productos Más Vendidos
    const productStatsMap = new Map<
      string,
      { productId: string; sku: string; name: string; unitsSold: number; totalRevenuePesos: number }
    >();

    for (const s of completedSales as any[]) {
      const items = Array.isArray(s.items) ? s.items : [];
      for (const item of items) {
        const sku = String(item.sku || 'SIN-SKU');
        const prodId = item.productId ? String(item.productId) : sku;
        const linePesos = (item.lineSubtotalCents || 0) / 100;
        const qty = item.quantity || 0;

        const current = productStatsMap.get(sku) || {
          productId: prodId,
          sku,
          name: String(item.name || 'Producto'),
          unitsSold: 0,
          totalRevenuePesos: 0,
        };

        current.unitsSold += qty;
        current.totalRevenuePesos = Number((current.totalRevenuePesos + linePesos).toFixed(2));
        productStatsMap.set(sku, current);
      }
    }

    const topProducts = Array.from(productStatsMap.values())
      .sort((a, b) => b.totalRevenuePesos - a.totalRevenuePesos)
      .slice(0, 6)
      .map((p) => ({
        ...p,
        sharePercentage:
          totalRevenuePesos > 0
            ? Number(((p.totalRevenuePesos / totalRevenuePesos) * 100).toFixed(1))
            : 0,
      }));

    // 9. Comparativa por Sucursal (Benchmark)
    let localesRev = 0;
    let localesTx = 0;
    let carrerasRev = 0;
    let carrerasTx = 0;

    for (const s of completedSales as any[]) {
      const cId = s.cashierId ? String(s.cashierId) : '';
      const cBranch = userMap.get(cId)?.branch || 'LOCALES';
      const sPesos = (s.totalCents || 0) / 100;

      if (cBranch === 'CARRERAS') {
        carrerasRev += sPesos;
        carrerasTx += 1;
      } else {
        localesRev += sPesos;
        localesTx += 1;
      }
    }

    localesRev = Number(localesRev.toFixed(2));
    carrerasRev = Number(carrerasRev.toFixed(2));

    const branchBenchmark = {
      locales: {
        totalPesos: localesRev,
        transactions: localesTx,
        averageTicketPesos: localesTx > 0 ? Number((localesRev / localesTx).toFixed(2)) : 0,
        sharePercentage:
          totalRevenuePesos > 0 ? Number(((localesRev / totalRevenuePesos) * 100).toFixed(1)) : 0,
      },
      carreras: {
        totalPesos: carrerasRev,
        transactions: carrerasTx,
        averageTicketPesos: carrerasTx > 0 ? Number((carrerasRev / carrerasTx).toFixed(2)) : 0,
        sharePercentage:
          totalRevenuePesos > 0 ? Number(((carrerasRev / totalRevenuePesos) * 100).toFixed(1)) : 0,
      },
    };

    // 10. Rendimiento por Vendedor (Staff Leaderboard)
    const staffMap = new Map<
      string,
      { fullName: string; email: string; branch: string; totalSalesPesos: number; transactionsCount: number }
    >();

    for (const s of completedSales as any[]) {
      const cId = s.cashierId ? String(s.cashierId) : 'DESCONOCIDO';
      const uInfo = userMap.get(cId) || {
        fullName: s.cashierSnapshot?.fullName || 'Vendedor',
        email: s.cashierSnapshot?.email || '',
        branch: s.cashierSnapshot?.branch || 'LOCALES',
      };

      const sPesos = (s.totalCents || 0) / 100;
      const current = staffMap.get(cId) || {
        fullName: uInfo.fullName,
        email: uInfo.email,
        branch: uInfo.branch,
        totalSalesPesos: 0,
        transactionsCount: 0,
      };

      current.totalSalesPesos = Number((current.totalSalesPesos + sPesos).toFixed(2));
      current.transactionsCount += 1;
      staffMap.set(cId, current);
    }

    const staffLeaderboard = Array.from(staffMap.entries())
      .map(([cashierId, data]) => ({
        cashierId,
        fullName: data.fullName,
        email: data.email,
        branch: data.branch,
        totalSalesPesos: data.totalSalesPesos,
        transactionsCount: data.transactionsCount,
        averageTicketPesos:
          data.transactionsCount > 0
            ? Number((data.totalSalesPesos / data.transactionsCount).toFixed(2))
            : 0,
      }))
      .sort((a, b) => b.totalSalesPesos - a.totalSalesPesos);

    // 11. Inteligencia de Clientes y Fidelización CRM
    const crmSales = completedSales.filter((s: any) => {
      return (
        (s.discountPercentageApplied && s.discountPercentageApplied > 0) ||
        (s.discountCents && s.discountCents > 0) ||
        Boolean(s.customerId) ||
        Boolean(s.customerSnapshot)
      );
    });

    const crmSalesCount = crmSales.length;
    const regularSalesCount = Math.max(0, totalTransactions - crmSalesCount);
    const crmAdoptionRate =
      totalTransactions > 0
        ? Number(((crmSalesCount / totalTransactions) * 100).toFixed(1))
        : 0;

    const totalCrmDiscountCents = crmSales.reduce((acc, s: any) => acc + (s.discountCents || 0), 0);
    const totalCrmDiscountPesos = Number((totalCrmDiscountCents / 100).toFixed(2));

    const crmInsights = {
      regularSalesCount,
      crmSalesCount,
      crmAdoptionRate,
      totalCrmDiscountPesos,
    };

    return {
      timeRange,
      branch: targetBranch,
      generatedAt: new Date().toISOString(),
      summary: {
        totalRevenuePesos,
        totalTransactions,
        averageTicketPesos,
        totalItemsSold,
        totalDiscountsPesos,
        cancelledCount,
        cancelledRevenuePesos,
        totalExpensesPesos,
        operatingCashFlowPesos,
        digitalPaymentRatio,
      },
      dailyTrend,
      paymentMix,
      topProducts,
      branchBenchmark,
      staffLeaderboard,
      crmInsights,
    };
  }
}
