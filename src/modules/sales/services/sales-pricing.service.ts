import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Product,
  ProductDocument,
} from '../../catalog/schemas/product.schema';
import { CrmService } from '../../crm/crm.service';
import { calculateSaleTotals } from '../domain/sale-pricing.calculator';
import { PreviewSaleDto } from '../dto/sale.dto';

@Injectable()
export class SalesPricingService {
  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    private readonly crmService: CrmService,
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
}
