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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser, UserRole } from '../../common/enums/role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AssignUserBranchDto, CreateUserDto } from './dto/user.dto';
import { UsersService, UserSummary } from './users.service';

@ApiTags('Users (Operadores: ADMIN, CRM, CASHIER y Asignación de Sucursal LOCALES | CARRERAS)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Crear un nuevo usuario (ADMIN solo por MASTER; CRM o CASHIER por ADMIN/MASTER) asignándole sucursal y empresa',
  })
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.create(dto, user);
  }

  @Patch(':id/branch')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Asignar o cambiar la sucursal (LOCALES o CARRERAS) de un vendedor o usuario CRM [Solo ADMIN/MASTER]',
  })
  assignBranch(
    @Param('id') id: string,
    @Body() dto: AssignUserBranchDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserSummary> {
    return this.usersService.assignBranch(id, dto.branch, user?.role);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Listar usuarios registrados con filtro opcional de empresa [Solo ADMIN/MASTER]',
  })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('companyId') companyId?: string,
  ): Promise<UserSummary[]> {
    return this.usersService.findAll(user, companyId);
  }
}
