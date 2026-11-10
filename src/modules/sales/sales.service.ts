import { Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { AuthenticatedUser } from '../../common/enums/role.enum';
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
  CancelSaleDto,
  CreateSaleDto,
  PreviewSaleDto,
} from './dto/sale.dto';
import { Sale, SaleDocument } from './schemas/sale.schema';
import {
  CreateQrOrderParams,
  MercadoPagoPosService,
  QrOrderResult,
} from './services/mercadopago-pos.service';
import { SalesBiService } from './services/sales-bi.service';
import { SalesPricingService } from './services/sales-pricing.service';
import { SalesQueryService } from './services/sales-query.service';
import { SalesTransactionService } from './services/sales-transaction.service';

/**
 * SalesService Facade
 * Orquesta y delega las operaciones de ventas POS en sus subservicios especializados:
 * - SalesPricingService: Cotización en tiempo real, descuentos CRM y de línea
 * - SalesTransactionService: Cobro y anulación con garantías transaccionales ACID
 * - SalesQueryService: Consultas y comprobantes con aislamiento por rol
 * - MercadoPagoPosService: Generación de QR dinámico y verificación de pagos
 * - SalesBiService: Inteligencia de negocios (BI), tendencias, top productos y KPIs
 */
@Injectable()
export class SalesService {
  public readonly pricingService: SalesPricingService;
  public readonly transactionService: SalesTransactionService;
  public readonly queryService: SalesQueryService;
  public readonly biService: SalesBiService;

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
    @Optional() pricingService?: SalesPricingService,
    @Optional() transactionService?: SalesTransactionService,
    @Optional() queryService?: SalesQueryService,
    @Optional() private readonly mpPosService?: MercadoPagoPosService,
    @Optional() biService?: SalesBiService,
  ) {
    this.pricingService =
      pricingService ||
      new SalesPricingService(this.productModel, this.crmService);

    this.transactionService =
      transactionService ||
      new SalesTransactionService(
        this.connection,
        this.saleModel,
        this.productModel,
        this.movementModel,
        this.crmService,
        this.masterService,
        this.treasuryService,
      );

    this.queryService =
      queryService ||
      new SalesQueryService(this.connection, this.saleModel);

    this.biService =
      biService ||
      new SalesBiService(this.connection, this.saleModel);
  }

  createMercadoPagoQrOrder(params: CreateQrOrderParams): Promise<QrOrderResult> {
    if (!this.mpPosService) {
      throw new ServiceUnavailableException('Servicio de Mercado Pago no inicializado');
    }
    return this.mpPosService.createQrOrder(params);
  }

  checkMercadoPagoPaymentStatus(externalReference: string) {
    if (!this.mpPosService) {
      throw new ServiceUnavailableException('Servicio de Mercado Pago no inicializado');
    }
    return this.mpPosService.checkPaymentStatus(externalReference);
  }

  /**
   * Calcula el desglose de una venta antes de cobrar.
   */
  previewSale(dto: PreviewSaleDto) {
    return this.pricingService.previewSale(dto);
  }

  /**
   * Registra una venta POS de forma transaccional ACID e idempotente.
   */
  createSale(
    dto: CreateSaleDto,
    cashierId: string,
    headerIdempotencyKey?: string,
    assignedBranch = 'LOCALES',
  ) {
    return this.transactionService.createSale(
      dto,
      cashierId,
      headerIdempotencyKey,
      assignedBranch,
    );
  }

  /**
   * Anula una venta con reversión de stock y saldos.
   */
  cancelSale(saleId: string, dto: CancelSaleDto, actorId: string) {
    return this.transactionService.cancelSale(saleId, dto, actorId);
  }

  /**
   * Lista ventas con aislamiento por rol.
   */
  findAllSales(
    limit = 50,
    user?: AuthenticatedUser,
    targetCashierId?: string,
    activeRegisterOnly = false,
  ) {
    return this.queryService.findAllSales(
      limit,
      user,
      targetCashierId,
      activeRegisterOnly,
    );
  }

  /**
   * Obtiene una venta por folio / ticket comprobante.
   */
  findByReceiptNumber(receiptNumber: string, user?: AuthenticatedUser) {
    return this.queryService.findByReceiptNumber(receiptNumber, user);
  }

  /**
   * Genera el reporte de Inteligencia de Negocios (BI) para administradores.
   */
  getBusinessIntelligence(
    timeRange: 'today' | '7d' | '30d' | 'all' = '7d',
    branch = 'ALL',
  ) {
    return this.biService.getBusinessIntelligence(timeRange, branch);
  }
}
