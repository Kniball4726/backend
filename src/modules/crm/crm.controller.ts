import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser, UserRole } from '../../common/enums/role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CrmService } from './crm.service';
import { AssignDiscountDto, CreateOrLoadCustomerDto } from './dto/customer.dto';

@ApiTags('CRM (Clientes y Asignación de Descuentos de 1 Uso)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('crm/customers')
export class CrmController {
  constructor(private readonly crmService: CrmService) {}

  @Post()
  @Roles(UserRole.CRM, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Registrar cliente con Nombres, Mail y Descuento % (registra fecha y hora automáticamente) [Rol: CRM, ADMIN]',
  })
  registerOrUpdate(
    @Body() dto: CreateOrLoadCustomerDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.crmService.registerCustomerWithDiscount(
      dto,
      user.sub,
      user.branch || 'LOCALES',
    );
  }

  @Patch(':id/discount')
  @Roles(UserRole.CRM, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Asignar/recargar un nuevo porcentaje de descuento de un solo uso a un cliente existente [Rol: CRM, ADMIN]',
  })
  assignDiscount(
    @Param('id') id: string,
    @Body() dto: AssignDiscountDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.crmService.assignDiscount(id, dto, user.sub);
  }

  @Get('search')
  @Roles(UserRole.CASHIER, UserRole.CRM, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Buscar cliente desde el POS por nombre o mail y consultar si tiene descuento disponible [Rol: CASHIER, CRM, ADMIN]',
  })
  @ApiQuery({
    name: 'q',
    required: false,
    description: 'Texto a buscar en nombres o mail del cliente',
  })
  @ApiQuery({
    name: 'onlyWithDiscount',
    required: false,
    type: Boolean,
    description: 'Filtrar solo clientes que tienen un descuento vigente sin usar',
  })
  search(
    @Query('q') q?: string,
    @Query('onlyWithDiscount') onlyWithDiscount?: string,
  ) {
    return this.crmService.searchForPos(q, onlyWithDiscount === 'true');
  }

  @Get(':id')
  @Roles(UserRole.CASHIER, UserRole.CRM, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Obtener detalle completo del cliente y su historial de descuentos [Rol: CASHIER, CRM, ADMIN]',
  })
  findOne(@Param('id') id: string) {
    return this.crmService.findById(id);
  }
}
