import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Mercado Pago (Webhooks Públicos)')
@Controller('sales/mercadopago')
export class MercadoPagoWebhookController {
  private readonly logger = new Logger(MercadoPagoWebhookController.name);

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Webhook IPN público para recibir notificaciones en tiempo real desde Mercado Pago',
  })
  handleWebhook(@Body() body: any, @Query() query: any) {
    this.logger.log(
      `Mercado Pago Webhook recibido. Tipo: ${body?.type || query?.topic || 'desconocido'}. ID: ${
        body?.data?.id || query?.id || query?.['data.id'] || 's/d'
      }`,
    );
    // Mercado Pago requiere un status HTTP 200/201 inmediato para no reintentar agresivamente
    return { received: true, timestamp: new Date().toISOString() };
  }
}
