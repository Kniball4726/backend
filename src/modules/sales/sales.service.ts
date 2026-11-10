import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import {
  AuthenticatedUser,
  UserRole,
} from '../../common/enums/role.enum';
import {
  Product,
  ProductDocument,
} from '../catalog/schemas/product.schema';
import { CrmService } from '../crm/crm.service';
import {
  InventoryMovement,
  InventoryMovementDocument,
} from '../inventory/schemas/inventory-movement.schema';
import { MasterService } from '../master/master.service';
import { TreasuryService } from '../treasury/treasury.service';
import {
  calculateSaleTotals,
  generateReceiptNumber,
} from './domain/sale-pricing.calculator';
import {
  CancelSaleDto,
  CreateSaleDto,
  PreviewSaleDto,
} from './dto/sale.dto';
import { Sale, SaleDocument } from './schemas/sale.schema';

@Injectable()
export class SalesService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Sale.name) private readonly saleModel: Model<SaleDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(InventoryMovement.name)
    private readonly movementModel: Model<InventoryMovementDocument>,
    private readonly crmService: CrmService,
    @Optional() private readonly masterService?: MasterService,
    @Optional() private readonly treasuryService?: TreasuryService,
  ) {}

  /**
   * Calcula el desglose de una venta (subtotal, descuento CRM del cliente, impuestos y total)
   * antes de cobrar en el móvil.
   */
  async previewSale(dto: PreviewSaleDto) {
    const productIds = dto.items.map((item) => {
      if (!Types.ObjectId.isValid(item.productId)) {
        throw new BadRequestException(
          `ID de producto inválido: ${item.productId}`,
        );
      }
      return new Types.ObjectId(item.productId);
    });

    const products = await this.productModel
      .find({ _id: { $in: productIds }, isActive: true })
      .lean();

    const productMap = new Map(products.map((p) => [p._id.toString(), p]));

    let subtotalCents = 0;
    let rawTaxCents = 0;

    const lineItems = dto.items.map((reqItem) => {
      const product = productMap.get(reqItem.productId);
      if (!product) {
        throw new NotFoundException(
          `Producto ${reqItem.productId} no encontrado o inactivo`,
        );
      }

      if (product.trackInventory && product.stock < reqItem.quantity) {
        throw new BadRequestException({
          code: 'INSUFFICIENT_STOCK',
          message: `Stock insuficiente para "${product.name}". Disponible: ${product.stock}, solicitado: ${reqItem.quantity}`,
        });
      }

      const basePriceCents =
        typeof reqItem.customPriceCents === 'number' &&
        reqItem.customPriceCents >= 0
          ? reqItem.customPriceCents
          : product.priceCents;

      const itemDiscountPct =
        typeof reqItem.discountPercentage === 'number' &&
        reqItem.discountPercentage >= 0
          ? Math.min(100, reqItem.discountPercentage)
          : 0;

      const unitPriceCents = Math.round(
        basePriceCents * (1 - itemDiscountPct / 100),
      );

      const lineSubtotalCents = Math.round(
        unitPriceCents * reqItem.quantity,
      );
      const lineTaxCents = Math.round(
        (lineSubtotalCents * product.taxRateBasisPoints) / 10000,
      );

      subtotalCents += lineSubtotalCents;
      rawTaxCents += lineTaxCents;

      return {
        productId: product._id.toString(),
        sku: product.sku,
        name: product.name,
        quantity: reqItem.quantity,
        unitPriceCents,
        taxRateBasisPoints: product.taxRateBasisPoints,
        lineSubtotalCents,
      };
    });

    let discountPercentageApplied =
      typeof dto.discountPercentage === 'number' && dto.discountPercentage >= 0
        ? Math.min(100, dto.discountPercentage)
        : 0;
    let customerInfo: {
      id: string;
      fullName: string;
      email: string;
      discountPercentageAvailable: number;
    } | null = null;

    if (dto.customerId) {
      const customer = await this.crmService.findById(dto.customerId);
      const availablePct = customer.activeDiscount?.isAvailable
        ? customer.activeDiscount.percentage
        : 0;

      customerInfo = {
        id: customer._id.toString(),
        fullName: customer.fullName,
        email: customer.email,
        discountPercentageAvailable: availablePct,
      };

      if (dto.applyCustomerDiscount) {
        if (!customer.activeDiscount?.isAvailable || availablePct <= 0) {
          throw new BadRequestException({
            code: 'CUSTOMER_DISCOUNT_UNAVAILABLE',
            message:
              'El cliente seleccionado no tiene un descuento vigente disponible en el CRM.',
          });
        }
        discountPercentageApplied = availablePct;
      }
    }

    const hasItemDiscounts = dto.items.some(
      (i) => typeof i.discountPercentage === 'number' && i.discountPercentage > 0,
    );

    const totals = calculateSaleTotals({
      subtotalCents,
      rawTaxCents,
      discountPercentageApplied: hasItemDiscounts ? 0 : discountPercentageApplied,
    });

    if (hasItemDiscounts && discountPercentageApplied > 0) {
      totals.discountPercentageApplied = discountPercentageApplied;
    }

    return {
      customer: customerInfo,
      items: lineItems,
      ...totals,
    };
  }

  /**
   * Registra una venta POS de forma transaccional ACID e Idempotente (sin consultas N+1).
   */
  async createSale(
    dto: CreateSaleDto,
    cashierId: string,
    headerIdempotencyKey?: string,
    assignedBranch = 'LOCALES',
  ) {
    const idempotencyKey = (
      headerIdempotencyKey ||
      dto.idempotencyKey ||
      ''
    ).trim();

    if (!idempotencyKey || idempotencyKey.length < 8) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message:
          'Debes enviar el header "Idempotency-Key" (o propiedad idempotencyKey) con un UUID único para proteger el cobro móvil.',
      });
    }

    if (this.masterService) {
      const settings = await this.masterService.getSettings();
      if (settings.maintenanceMode?.posPaused) {
        throw new ServiceUnavailableException({
          code: 'POS_PAUSED_BY_MASTER',
          message:
            settings.maintenanceMode.reason ||
            'El Punto de Venta se encuentra temporalmente en pausa por inventario/mantenimiento dispuesto por el usuario MASTER.',
        });
      }
    }

    const existingSale = await this.saleModel
      .findOne({ idempotencyKey })
      .lean();
    if (existingSale) {
      return {
        idempotentReplay: true,
        sale: existingSale,
      };
    }

    const productObjectIds = dto.items.map((reqItem) => {
      if (!Types.ObjectId.isValid(reqItem.productId)) {
        throw new BadRequestException(
          `ID de producto inválido: ${reqItem.productId}`,
        );
      }
      return new Types.ObjectId(reqItem.productId);
    });

    const session = await this.connection.startSession();
    try {
      let createdSaleDoc: Record<string, unknown> | null = null;

      await session.withTransaction(async () => {
        const insideExisting = await this.saleModel
          .findOne({ idempotencyKey })
          .session(session)
          .lean();
        if (insideExisting) {
          createdSaleDoc = insideExisting as unknown as Record<string, unknown>;
          return;
        }

        const receiptNumber = generateReceiptNumber();
        const cashierObjId = new Types.ObjectId(cashierId);
        const saleId = new Types.ObjectId();

        // Carga en lote de todos los productos del carrito en 1 sola consulta (evita N+1)
        const productsInCart = await this.productModel
          .find({
            _id: { $in: productObjectIds },
            isActive: true,
          })
          .session(session)
          .exec();

        const productMap = new Map(
          productsInCart.map((p) => [p._id.toString(), p]),
        );

        let subtotalCents = 0;
        let rawTaxCents = 0;
        const saleItems = [];
        const inventoryMovements = [];

        for (const reqItem of dto.items) {
          const product = productMap.get(reqItem.productId);

          if (!product) {
            throw new NotFoundException(
              `Producto ${reqItem.productId} no encontrado o inactivo`,
            );
          }

          if (product.trackInventory) {
            const updatedProduct = await this.productModel
              .findOneAndUpdate(
                {
                  _id: product._id,
                  stock: { $gte: reqItem.quantity },
                },
                {
                  $inc: { stock: -reqItem.quantity },
                },
                { new: true, session },
              )
              .exec();

            if (!updatedProduct) {
              throw new BadRequestException({
                code: 'INSUFFICIENT_STOCK',
                message: `Stock insuficiente para "${product.name}". Disponible: ${product.stock}, solicitado: ${reqItem.quantity}`,
              });
            }

            inventoryMovements.push({
              productId: product._id,
              userId: cashierObjId,
              type: 'SALE' as const,
              quantityDelta: -reqItem.quantity,
              previousStock: product.stock,
              newStock: updatedProduct.stock,
              referenceId: saleId,
              notes: `Venta POS ${receiptNumber}`,
            });
          }

          const basePriceCents =
            typeof reqItem.customPriceCents === 'number' &&
            reqItem.customPriceCents >= 0
              ? reqItem.customPriceCents
              : product.priceCents;

          const itemDiscountPct =
            typeof reqItem.discountPercentage === 'number' &&
            reqItem.discountPercentage >= 0
              ? Math.min(100, reqItem.discountPercentage)
              : 0;

          const unitPriceCents = Math.round(
            basePriceCents * (1 - itemDiscountPct / 100),
          );

          const lineSubtotalCents = Math.round(
            unitPriceCents * reqItem.quantity,
          );
          const lineTaxCents = Math.round(
            (lineSubtotalCents * product.taxRateBasisPoints) / 10000,
          );

          subtotalCents += lineSubtotalCents;
          rawTaxCents += lineTaxCents;

          saleItems.push({
            productId: product._id,
            sku: product.sku,
            name: product.name,
            quantity: reqItem.quantity,
            unitPriceCents,
            taxRateBasisPoints: product.taxRateBasisPoints,
            lineSubtotalCents,
          });
        }

        let customerObjId: Types.ObjectId | null = null;
        let customerSnapshot: {
          fullName: string;
          email: string;
          discountPercentageApplied: number;
        } | null = null;
        let discountPercentageApplied =
          typeof dto.discountPercentage === 'number' &&
          dto.discountPercentage >= 0
            ? Math.min(100, dto.discountPercentage)
            : 0;

        if (dto.customerId) {
          if (dto.applyCustomerDiscount) {
            const consumed =
              await this.crmService.consumeCustomerDiscountInTransaction(
                dto.customerId,
                receiptNumber,
                session,
              );
            customerObjId = consumed.customerId;
            discountPercentageApplied = consumed.discountPercentage;
            customerSnapshot = {
              fullName: consumed.fullName,
              email: consumed.email,
              discountPercentageApplied: consumed.discountPercentage,
            };
          } else {
            const customer = await this.crmService.findById(dto.customerId);
            customerObjId = new Types.ObjectId(customer._id.toString());
            customerSnapshot = {
              fullName: customer.fullName,
              email: customer.email,
              discountPercentageApplied: 0,
            };
          }
        } else if (dto.applyCustomerDiscount) {
          throw new BadRequestException(
            'Para aplicar un descuento del CRM debes indicar el customerId del cliente.',
          );
        }

        const hasItemDiscounts = dto.items.some(
          (i) => typeof i.discountPercentage === 'number' && i.discountPercentage > 0,
        );

        const totalsCalc = calculateSaleTotals({
          subtotalCents,
          rawTaxCents,
          discountPercentageApplied: hasItemDiscounts ? 0 : discountPercentageApplied,
        });

        const discountCents = totalsCalc.discountCents;
        const taxCents = totalsCalc.taxCents;
        const totalCents = totalsCalc.totalCents;

        const totalPaidCents = dto.payments.reduce(
          (sum, p) => sum + p.amountCents,
          0,
        );

        if (totalPaidCents < totalCents) {
          throw new BadRequestException({
            code: 'INSUFFICIENT_PAYMENT',
            message: `El monto pagado (${totalPaidCents} centavos) es menor al total de la venta con descuento (${totalCents} centavos).`,
            details: {
              subtotalCents,
              discountPercentageApplied,
              discountCents,
              taxCents,
              totalCents,
              totalPaidCents,
            },
          });
        }

        if (inventoryMovements.length > 0) {
          await this.movementModel.insertMany(inventoryMovements, { session });
        }

        const [createdSale] = await this.saleModel.create(
          [
            {
              _id: saleId,
              receiptNumber,
              idempotencyKey,
              cashierId: cashierObjId,
              customerId: customerObjId,
              customerSnapshot,
              items: saleItems,
              subtotalCents,
              discountPercentageApplied,
              discountCents,
              taxCents,
              totalCents,
              payments: dto.payments.map((p) => ({
                method: p.method,
                amountCents: p.amountCents,
                reference: p.reference ?? null,
              })),
              status: 'COMPLETED',
              deviceTimestamp: dto.deviceTimestamp
                ? new Date(dto.deviceTimestamp)
                : new Date(),
            },
          ],
          { session },
        );

        await this.treasuryService?.adjustOpenRegisterBalanceInTransaction(
          totalCents,
          cashierId,
          assignedBranch,
          session,
        );

        createdSaleDoc = {
          ...createdSale.toObject(),
          changeDueCents: totalPaidCents - totalCents,
        };
      });

      if (createdSaleDoc) {
        void this.masterService?.dispatchWebhookEvent(
          'sale.completed',
          createdSaleDoc,
        );
      }

      return {
        idempotentReplay: false,
        sale: createdSaleDoc,
      };
    } finally {
      await session.endSession();
    }
  }

  /**
   * Anula una venta con transacción ACID: revierte el stock al Kardex (RETURN),
   * restaura el descuento CRM de un solo uso (si se utilizó) y descuenta el saldo de Caja.
   */
  async cancelSale(saleId: string, dto: CancelSaleDto, actorId: string) {
    if (!Types.ObjectId.isValid(saleId)) {
      throw new BadRequestException('ID de venta inválido');
    }

    const session = await this.connection.startSession();
    try {
      let cancelledDoc: Record<string, unknown> | null = null;

      await session.withTransaction(async () => {
        const sale = await this.saleModel
          .findOne({ _id: new Types.ObjectId(saleId) })
          .session(session)
          .exec();

        if (!sale) {
          throw new NotFoundException('Venta no encontrada');
        }

        if (sale.status === 'CANCELLED') {
          throw new BadRequestException('Esta venta ya se encuentra anulada');
        }

        const actorObjId = Types.ObjectId.isValid(actorId)
          ? new Types.ObjectId(actorId)
          : sale.cashierId;

        const returnMovements = [];
        for (const item of sale.items) {
          const updatedProd = await this.productModel
            .findOneAndUpdate(
              { _id: item.productId, trackInventory: true },
              { $inc: { stock: item.quantity } },
              { new: true, session },
            )
            .exec();

          if (updatedProd) {
            returnMovements.push({
              productId: item.productId,
              userId: actorObjId,
              type: 'RETURN' as const,
              quantityDelta: item.quantity,
              previousStock: updatedProd.stock - item.quantity,
              newStock: updatedProd.stock,
              referenceId: sale._id,
              notes: `Anulación de venta ${sale.receiptNumber}${dto.reason ? ` (${dto.reason})` : ''}`,
            });
          }
        }

        if (returnMovements.length > 0) {
          await this.movementModel.insertMany(returnMovements, { session });
        }

        if (sale.customerId && sale.discountPercentageApplied > 0) {
          await this.crmService.restoreCustomerDiscountInTransaction(
            sale.customerId,
            sale.receiptNumber,
            session,
          );
        }

        sale.status = 'CANCELLED';
        await sale.save({ session });

        await this.treasuryService?.adjustOpenRegisterBalanceInTransaction(
          -sale.totalCents,
          sale.cashierId.toString(),
          'LOCALES',
          session,
        );

        cancelledDoc = sale.toObject() as unknown as Record<string, unknown>;
      });

      if (cancelledDoc) {
        void this.masterService?.dispatchWebhookEvent(
          'sale.cancelled',
          cancelledDoc,
        );
      }

      return {
        cancelled: true,
        sale: cancelledDoc,
      };
    } finally {
      await session.endSession();
    }
  }

  /**
   * Lista ventas aplicando aislamiento por rol:
   * - Rol CASHIER: ve exclusivamente sus propias ventas (filtradas por cashierId).
   * - Rol ADMIN / MASTER: ve todas las ventas o puede filtrar por cashierId.
   */
  async findAllSales(
    limit = 50,
    user?: AuthenticatedUser,
    targetCashierId?: string,
  ) {
    const filter: Record<string, unknown> = {};
    if (user?.role === UserRole.CASHIER && Types.ObjectId.isValid(user.sub)) {
      filter.cashierId = new Types.ObjectId(user.sub);
    } else if (targetCashierId && Types.ObjectId.isValid(targetCashierId)) {
      filter.cashierId = new Types.ObjectId(targetCashierId);
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
