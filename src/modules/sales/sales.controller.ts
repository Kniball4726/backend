import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser, UserRole } from '../../common/enums/role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CancelSaleDto,
  CreateSaleDto,
  PreviewSaleDto,
} from './dto/sale.dto';
import { SalesService } from './sales.service';

@ApiTags('Sales / POS (Cobros ACID por Vendedor, Idempotencia, Anulaciones y Descuento CRM)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.CASHIER)
  @ApiOperation({
    summary:
      'Cotizar carrito en tiempo real (calcula subtotal, descuento CRM del cliente, impuestos y total antes de cobrar) [Solo CASHIER y MASTER]',
  })
  preview(@Body() dto: PreviewSaleDto) {
    return this.salesService.previewSale(dto);
  }

  @Post()
  @Roles(UserRole.CASHIER)
  @ApiHeader({
    name: 'idempotency-key',
    required: false,
    description:
      'UUIDv4 generado por el móvil para garantizar que reintentos de red nunca cobren ni descuenten stock dos veces',
  })
  @ApiOperation({
    summary:
      'Registrar venta en POS con transacción ACID (descuenta stock, suma a la caja propia del vendedor y consume descuento CRM) [Solo CASHIER y MASTER]',
  })
  create(
    @Body() dto: CreateSaleDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.salesService.createSale(
      dto,
      user.sub,
      idempotencyKey,
      user.branch || 'LOCALES',
    );
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Anular venta con transacción ACID (devuelve stock al Kardex, restaura descuento CRM y descuenta de la caja del vendedor) [Rol: ADMIN, MASTER]',
  })
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelSaleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.salesService.cancelSale(id, dto, user.sub);
  }

  @Get()
  @Roles(UserRole.CASHIER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Listar ventas: cada CASHIER ve únicamente sus propias ventas; ADMIN y MASTER ven todas o filtran por vendedor. Permite filtrar solo la caja activa.',
  })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({
    name: 'cashierId',
    required: false,
    description: 'Filtrar por ID de vendedor (solo para ADMIN/MASTER)',
  })
  @ApiQuery({
    name: 'activeRegisterOnly',
    required: false,
    description:
      'Filtrar solo ventas de la caja actualmente abierta (por defecto true para el POS del cajero)',
  })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
    @Query('cashierId') cashierId?: string,
    @Query('activeRegisterOnly') activeRegisterOnly?: string,
  ) {
    return this.salesService.findAllSales(
      limit ? Number(limit) : 50,
      user,
      cashierId,
      activeRegisterOnly === 'true',
    );
  }

  @Get('receipt/:receiptNumber')
  @Roles(UserRole.CASHIER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Buscar ticket por folio (CASHIER solo puede consultar sus propios comprobantes)',
  })
  findByReceipt(
    @Param('receiptNumber') receiptNumber: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.salesService.findByReceiptNumber(receiptNumber, user);
  }

  @Post('mercadopago/create-qr-order')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.CASHIER)
  @ApiOperation({
    summary:
      'Generar orden con QR dinámico de Mercado Pago para cobro en POS [CASHIER o MASTER]',
  })
  createMercadoPagoQr(
    @Body()
    dto: {
      totalPesos: number;
      title?: string;
      externalReference: string;
    },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.salesService.createMercadoPagoQrOrder({
      totalPesos: dto.totalPesos,
      title: dto.title,
      externalReference: dto.externalReference,
      cashierBranch: user.branch,
      cashierName: user.fullName,
    });
  }

  @Get('mercadopago/order-status/:externalReference')
  @Roles(UserRole.CASHIER)
  @ApiOperation({
    summary:
      'Consultar en tiempo real si el cliente abonó la orden QR de Mercado Pago [CASHIER o MASTER]',
  })
  checkMercadoPagoStatus(
    @Param('externalReference') externalReference: string,
  ) {
    return this.salesService.checkMercadoPagoPaymentStatus(externalReference);
  }
}
