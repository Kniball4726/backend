import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser, UserRole } from '../../common/enums/role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdjustStockDto } from './dto/inventory.dto';
import { InventoryService } from './inventory.service';

@ApiTags('Inventory (Control de Stock y Kardex)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('adjust')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Registrar entrada de mercancía o ajuste de inventario con transacción ACID [Solo ADMIN]',
  })
  adjustStock(
    @Body() dto: AdjustStockDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.adjustStock(dto, user.sub);
  }

  @Get('products/:productId/movements')
  @Roles(UserRole.ADMIN, UserRole.CASHIER)
  @ApiOperation({ summary: 'Consultar Kardex (historial de movimientos) de un producto' })
  getMovements(@Param('productId') productId: string) {
    return this.inventoryService.getProductMovements(productId);
  }
}
