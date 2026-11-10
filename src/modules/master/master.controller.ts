import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser, UserRole } from '../../common/enums/role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CreateApiKeyDto,
  CreateWebhookDto,
  TestAfipConnectionDto,
  UpdateAfipSettingsDto,
  UpdateMercadoPagoSettingsDto,
  UpdateSystemSettingsDto,
} from './dto/master.dto';
import { MasterService } from './master.service';

@ApiTags('Master Control (Exclusivo Superusuario MASTER: Configuración, API Keys, Kill-Switch y Auditoría)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.MASTER)
@Controller('master')
export class MasterController {
  constructor(private readonly masterService: MasterService) {}

  @Get('settings')
  @ApiOperation({
    summary:
      'Consultar configuración global (tope de descuento CRM, impuestos, modo mantenimiento) [Exclusivo MASTER]',
  })
  getSettings() {
    return this.masterService.getSettings();
  }

  @Patch('settings')
  @ApiOperation({
    summary:
      'Modificar configuración global o activar/desactivar Modo Mantenimiento en POS/CRM [Exclusivo MASTER]',
  })
  updateSettings(
    @Body() dto: UpdateSystemSettingsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.masterService.updateSettings(dto, user);
  }

  @Get('integrations/mercadopago')
  @ApiOperation({
    summary:
      'Consultar credenciales y estado de integración de Mercado Pago (enmascarado) [Exclusivo MASTER]',
  })
  getMercadoPagoSettings(@Query('companyId') companyId?: string) {
    return this.masterService.getMercadoPagoSettings(true, companyId);
  }

  @Patch('integrations/mercadopago')
  @ApiOperation({
    summary:
      'Actualizar credenciales de API (Access Token, Public Key, Webhook) de Mercado Pago [Exclusivo MASTER]',
  })
  updateMercadoPagoSettings(
    @Body() dto: UpdateMercadoPagoSettingsDto,
    @CurrentUser() user: AuthenticatedUser,
    @Query('companyId') companyId?: string,
  ) {
    return this.masterService.updateMercadoPagoSettings(dto, user, companyId);
  }

  @Post('integrations/mercadopago/test-connection')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Probar en vivo la validez del Access Token contra la API oficial de Mercado Pago [Exclusivo MASTER]',
  })
  testMercadoPagoConnection(
    @CurrentUser() user: AuthenticatedUser,
    @Body('accessToken') tokenOverride?: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.masterService.testMercadoPagoConnection(
      user,
      tokenOverride,
      companyId,
    );
  }

  @Get('integrations/afip')
  @ApiOperation({
    summary:
      'Consultar configuración, certificados y estado de facturación electrónica AFIP / ARCA (enmascarado) [Exclusivo MASTER]',
  })
  getAfipSettings(@Query('companyId') companyId?: string) {
    return this.masterService.getAfipSettings(true, companyId);
  }

  @Patch('integrations/afip')
  @ApiOperation({
    summary:
      'Actualizar configuración, CUIT, punto de venta y certificados de AFIP / ARCA [Exclusivo MASTER]',
  })
  updateAfipSettings(
    @Body() dto: UpdateAfipSettingsDto,
    @CurrentUser() user: AuthenticatedUser,
    @Query('companyId') companyId?: string,
  ) {
    return this.masterService.updateAfipSettings(dto, user, companyId);
  }

  @Post('integrations/afip/test-connection')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Probar en vivo la comunicación con servidores de AFIP / ARCA (WSAA / WSFE FEDummy) [Exclusivo MASTER]',
  })
  testAfipConnection(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto?: TestAfipConnectionDto,
    @Query('companyId') companyId?: string,
  ) {
    return this.masterService.testAfipConnection(user, dto, companyId);
  }

  @Post('api-keys')
  @ApiOperation({
    summary:
      'Crear una clave API (X-API-Key) con scopes para que otra aplicación externa se conecte [Exclusivo MASTER]',
  })
  createApiKey(
    @Body() dto: CreateApiKeyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.masterService.createApiKey(dto, user);
  }

  @Get('api-keys')
  @ApiOperation({
    summary:
      'Listar claves API creadas, sus scopes y fecha de último uso [Exclusivo MASTER]',
  })
  listApiKeys() {
    return this.masterService.listApiKeys();
  }

  @Patch('api-keys/:id/revoke')
  @ApiOperation({
    summary:
      'Revocar inmediatamente una clave API de una aplicación externa [Exclusivo MASTER]',
  })
  revokeApiKey(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.masterService.revokeApiKey(id, user);
  }

  @Post('security/revoke-all-sessions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Kill-Switch: Cerrar forzosamente todas las sesiones móviles activas de todos los operadores [Exclusivo MASTER]',
  })
  revokeAllSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.masterService.revokeAllMobileSessions(user);
  }

  @Post('webhooks')
  @ApiOperation({
    summary:
      'Registrar un Webhook saliente para notificar a otra aplicación externa en tiempo real [Exclusivo MASTER]',
  })
  createWebhook(
    @Body() dto: CreateWebhookDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.masterService.createWebhook(dto, user);
  }

  @Get('webhooks')
  @ApiOperation({ summary: 'Listar Webhooks configurados [Exclusivo MASTER]' })
  listWebhooks() {
    return this.masterService.listWebhooks();
  }

  @Delete('webhooks/:id')
  @ApiOperation({ summary: 'Eliminar un Webhook [Exclusivo MASTER]' })
  deleteWebhook(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.masterService.deleteWebhook(id, user);
  }

  @Get('audit-logs')
  @ApiOperation({
    summary:
      'Consultar bitácora de auditoría (acciones críticas y uso de API Keys) [Exclusivo MASTER]',
  })
  listAuditLogs(@Query('limit') limit?: string) {
    return this.masterService.listAuditLogs(limit ? Number(limit) : 100);
  }
}
