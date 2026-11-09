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
import {
  CreateCashOperationDto,
  OpenRegisterDto,
} from './dto/treasury.dto';
import { TreasuryService } from './treasury.service';

@ApiTags('Treasury / Tesorería (Cajas por Vendedor, Apertura/Cierre Individual, Operaciones y Gastos)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('treasury')
export class TreasuryController {
  constructor(private readonly treasuryService: TreasuryService) {}

  @Get('registers')
  @Roles(UserRole.CASHIER, UserRole.CRM, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Listar cajas: cada CASHIER ve solo sus propias cajas; ADMIN y MASTER ven todas o filtran por vendedor',
  })
  @ApiQuery({ name: 'branch', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['ABIERTA', 'CERRADA'] })
  @ApiQuery({
    name: 'userId',
    required: false,
    description: 'Filtrar por ID de vendedor (solo para ADMIN/MASTER)',
  })
  listRegisters(
    @CurrentUser() user: AuthenticatedUser,
    @Query('branch') branch?: string,
    @Query('status') status?: 'ABIERTA' | 'CERRADA',
    @Query('userId') userId?: string,
  ) {
    return this.treasuryService.listRegisters(user, branch, status, userId);
  }

  @Post('registers/open')
  @Roles(UserRole.CASHIER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Abrir nueva caja propia ("Ventas Sucursal" individual por vendedor o "Caja Consolidada" de sucursal)',
  })
  openRegister(
    @Body() dto: OpenRegisterDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.treasuryService.openRegister(dto, user);
  }

  @Patch('registers/:id/close')
  @Roles(UserRole.CASHIER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Cerrar caja abierta (cada vendedor solo puede cerrar su propia caja; ADMIN/MASTER pueden cerrar cualquiera)',
  })
  closeRegister(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.treasuryService.closeRegister(id, user);
  }

  @Get('operations')
  @Roles(UserRole.CASHIER, UserRole.CRM, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Listar operaciones y gastos: cada CASHIER ve solo sus propios movimientos; ADMIN/MASTER ven todos',
  })
  @ApiQuery({ name: 'branch', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listOperations(
    @CurrentUser() user: AuthenticatedUser,
    @Query('branch') branch?: string,
    @Query('limit') limit?: string,
  ) {
    return this.treasuryService.listOperations(
      user,
      branch,
      limit ? Number(limit) : 50,
    );
  }

  @Post('operations')
  @Roles(UserRole.CASHIER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Registrar operación de caja o Nuevo Gasto descontando exclusivamente de la caja abierta del vendedor',
  })
  createOperation(
    @Body() dto: CreateCashOperationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.treasuryService.createOperation(dto, user);
  }
}
