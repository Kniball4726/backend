import {
  Body,
  Controller,
  Delete,
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
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CatalogService } from './catalog.service';
import {
  CreateCategoryDto,
  CreateProductDto,
  UpdateProductDto,
} from './dto/catalog.dto';

@ApiTags('Catalog (Categorías, Productos y Sincronización Móvil)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('sync')
  @Roles(UserRole.CASHIER, UserRole.CRM, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Sincronización Delta Mobile-First: descarga solo categorías y productos modificados desde updatedSince',
  })
  @ApiQuery({
    name: 'updatedSince',
    required: false,
    description:
      'Fecha ISO-8601 de la última sincronización guardada en el dispositivo móvil',
  })
  sync(@Query('updatedSince') updatedSince?: string) {
    return this.catalogService.syncCatalogDelta(updatedSince);
  }

  @Post('categories')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear categoría de productos [Solo ADMIN]' })
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.catalogService.createCategory(dto);
  }

  @Get('categories')
  @Roles(UserRole.CASHIER, UserRole.CRM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Listar categorías activas' })
  findAllCategories() {
    return this.catalogService.findAllCategories();
  }

  @Post('products')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear producto en catálogo [Solo ADMIN]' })
  createProduct(@Body() dto: CreateProductDto) {
    return this.catalogService.createProduct(dto);
  }

  @Get('products')
  @Roles(UserRole.CASHIER, UserRole.CRM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Buscar o listar productos activos para el POS' })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({
    name: 'includeInactive',
    required: false,
    type: Boolean,
    description: 'Incluir productos desactivados [Para gestión ADMIN]',
  })
  findAllProducts(
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    const shouldInclude =
      includeInactive === 'true' || includeInactive === '1';
    return this.catalogService.findAllProducts(
      categoryId,
      search,
      shouldInclude,
    );
  }

  @Get('products/barcode/:barcode')
  @Roles(UserRole.CASHIER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Búsqueda instantánea O(log n) por código de barras desde lector/cámara móvil',
  })
  findByBarcode(@Param('barcode') barcode: string) {
    return this.catalogService.findByBarcode(barcode);
  }

  @Patch('products/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Actualizar datos o precio de un producto [Solo ADMIN/MASTER]',
  })
  updateProduct(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.catalogService.updateProduct(id, dto);
  }

  @Delete('products/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Desactivar o dar de baja producto [Solo ADMIN/MASTER]',
  })
  deleteProduct(@Param('id') id: string) {
    return this.catalogService.deleteProduct(id);
  }
}
