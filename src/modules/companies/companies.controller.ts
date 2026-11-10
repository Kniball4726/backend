import {
  Body,
  Controller,
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
import { CompaniesService } from './companies.service';
import {
  CreateCompanyDto,
  UpdateBrandingDto,
  UpdateCompanyDto,
} from './dto/company.dto';

@ApiTags('Public Branding & Multi-Empresa')
@Controller()
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get('public/branding')
  @ApiOperation({
    summary:
      'Obtener identidad visual y logotipo activo de la aplicación (Público para Login y Topbar)',
  })
  getPublicBranding(@Query('companyId') companyId?: string) {
    return this.companiesService.getPublicBranding(companyId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MASTER)
  @Get('master/companies')
  @ApiOperation({
    summary:
      'Listar todas las empresas registradas en la plataforma Multi-Tenant [Exclusivo MASTER]',
  })
  listCompanies() {
    return this.companiesService.findAll();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MASTER)
  @Post('master/companies')
  @ApiOperation({
    summary:
      'Registrar una nueva empresa con su CUIT, Razón Social y marca [Exclusivo MASTER]',
  })
  createCompany(
    @Body() dto: CreateCompanyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.create(dto, user);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MASTER)
  @Get('master/companies/:id')
  @ApiOperation({
    summary:
      'Consultar detalle completo de una empresa [Exclusivo MASTER]',
  })
  getCompanyById(@Param('id') id: string) {
    return this.companiesService.findById(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MASTER)
  @Patch('master/companies/:id')
  @ApiOperation({
    summary:
      'Modificar datos generales o CUIT de una empresa [Exclusivo MASTER]',
  })
  updateCompany(
    @Param('id') id: string,
    @Body() dto: UpdateCompanyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.update(id, dto, user);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MASTER)
  @Patch('master/companies/:id/status')
  @ApiOperation({
    summary:
      'Activar o suspender una empresa [Exclusivo MASTER]',
  })
  toggleCompanyStatus(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.toggleStatus(id, user);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MASTER)
  @Post('master/companies/branding')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Personalizar nombre de la app, logotipo SVG/PNG y eslogan de la empresa principal [Exclusivo MASTER]',
  })
  updateGlobalBranding(
    @Body() dto: UpdateBrandingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.updateBranding(null, dto, user);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MASTER)
  @Post('master/companies/:id/branding')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Personalizar logotipo y marca de una empresa específica [Exclusivo MASTER]',
  })
  updateCompanyBranding(
    @Param('id') id: string,
    @Body() dto: UpdateBrandingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.updateBranding(id, dto, user);
  }
}
