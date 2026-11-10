import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Connection, Model, Types } from 'mongoose';
import { AuthenticatedUser, BranchName, UserRole } from '../../common/enums/role.enum';
import { COLLECTION_NAMES } from '../../database/json-schemas/constants';
import { CreateUserDto } from './dto/user.dto';
import { User, UserDocument } from './schemas/user.schema';

export interface UserSummary {
  _id: Types.ObjectId | string;
  email: string;
  fullName: string;
  role: UserRole;
  branch: BranchName;
  companyId?: string | null;
  companyName?: string | null;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @Optional() @InjectConnection() private readonly connection?: Connection,
  ) {}

  private get db() {
    return this.connection?.db;
  }

  async create(dto: CreateUserDto, requester?: AuthenticatedUser | UserRole) {
    const requesterRole =
      typeof requester === 'string' ? requester : requester?.role;
    const requesterUser =
      typeof requester === 'object' ? requester : undefined;

    // Regla 1: Un ADMIN no puede crear usuarios con rol ADMIN
    if (dto.role === UserRole.ADMIN && requesterRole !== UserRole.MASTER) {
      throw new ForbiddenException(
        'Los administradores no tienen permisos para crear otros administradores. Solo el usuario MASTER puede crear administradores.',
      );
    }

    const existing = await this.userModel
      .findOne({ email: dto.email.toLowerCase() })
      .lean();
    if (existing) {
      throw new ConflictException(
        `Ya existe un usuario registrado con el correo ${dto.email}`,
      );
    }

    // Regla 2: Asignación de Empresa (Multi-Tenant)
    let targetCompanyId: Types.ObjectId | null = null;
    let targetCompanyName: string | null = null;

    if (requesterRole === UserRole.ADMIN) {
      // Si crea un ADMIN, se asigna automáticamente a la empresa del administrador
      if (requesterUser?.companyId && Types.ObjectId.isValid(requesterUser.companyId)) {
        targetCompanyId = new Types.ObjectId(requesterUser.companyId);
        targetCompanyName = requesterUser.companyName || null;
      } else if (this.db) {
        // Fallback a empresa default
        const defaultCompany: any = await this.db
          .collection(COLLECTION_NAMES.COMPANIES)
          .findOne({ isDefault: true });
        if (defaultCompany) {
          targetCompanyId = defaultCompany._id;
          targetCompanyName = defaultCompany.name;
        }
      }
    } else if (requesterRole === UserRole.MASTER) {
      // El usuario MASTER puede elegir a qué empresa asignarlo
      if (dto.companyId && Types.ObjectId.isValid(dto.companyId) && this.db) {
        const company: any = await this.db
          .collection(COLLECTION_NAMES.COMPANIES)
          .findOne({ _id: new Types.ObjectId(dto.companyId) });
        if (!company) {
          throw new BadRequestException('La empresa seleccionada no existe');
        }
        targetCompanyId = company._id;
        targetCompanyName = company.name;
      } else if (this.db) {
        // Si no seleccionó empresa, asociar a la empresa predeterminada
        const defaultCompany: any = await this.db
          .collection(COLLECTION_NAMES.COMPANIES)
          .findOne({ isDefault: true });
        if (defaultCompany) {
          targetCompanyId = defaultCompany._id;
          targetCompanyName = defaultCompany.name;
        }
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const created = await this.userModel.create({
      email: dto.email.toLowerCase(),
      passwordHash,
      fullName: dto.fullName,
      role: dto.role,
      branch: dto.branch ?? BranchName.LOCALES,
      companyId: targetCompanyId,
      companyName: targetCompanyName,
      refreshTokenHash: null,
      isActive: true,
    });

    return {
      id: created._id.toString(),
      email: created.email,
      fullName: created.fullName,
      role: created.role,
      branch: created.branch,
      companyId: created.companyId ? created.companyId.toString() : null,
      companyName: created.companyName || null,
      isActive: created.isActive,
      createdAt: created.createdAt,
    };
  }

  async assignBranch(
    userId: string,
    branch: BranchName,
    requesterRole?: UserRole,
  ): Promise<UserSummary> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('ID de usuario inválido');
    }

    const existing = await this.userModel.findById(userId).lean();
    if (!existing) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (
      requesterRole !== UserRole.MASTER &&
      existing.role !== UserRole.CRM &&
      existing.role !== UserRole.CASHIER
    ) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const updated = await this.userModel
      .findByIdAndUpdate(userId, { $set: { branch } }, { new: true })
      .select('-passwordHash -refreshTokenHash')
      .lean();

    if (!updated) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return {
      ...(updated as any),
      branch: (updated as any).branch || BranchName.LOCALES,
    };
  }

  async findAll(
    requester?: AuthenticatedUser | UserRole,
    companyIdFilter?: string,
  ): Promise<UserSummary[]> {
    const requesterRole =
      typeof requester === 'string' ? requester : requester?.role;
    const requesterUser =
      typeof requester === 'object' ? requester : undefined;

    const query: Record<string, any> = {};

    if (requesterRole === UserRole.ADMIN && requesterUser?.companyId) {
      // Un ADMIN solo ve los usuarios asignados a su propia empresa
      if (Types.ObjectId.isValid(requesterUser.companyId)) {
        query.companyId = new Types.ObjectId(requesterUser.companyId);
      }
    } else if (requesterRole === UserRole.MASTER && companyIdFilter) {
      if (Types.ObjectId.isValid(companyIdFilter)) {
        query.companyId = new Types.ObjectId(companyIdFilter);
      }
    }

    const users = await this.userModel
      .find(query)
      .select('-passwordHash -refreshTokenHash')
      .sort({ createdAt: -1 })
      .lean();

    const visibleUsers =
      requesterRole === UserRole.MASTER
        ? users
        : users.filter(
            (u: any) =>
              u.role === UserRole.CRM || u.role === UserRole.CASHIER,
          );

    return visibleUsers.map((u: any) => ({
      ...u,
      companyId: u.companyId ? u.companyId.toString() : null,
      companyName: u.companyName || null,
      branch: u.branch || BranchName.LOCALES,
    }));
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  async findById(id: string): Promise<UserDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('ID de usuario inválido');
    }
    const user = await this.userModel.findById(id).exec();
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return user;
  }

  async updateRefreshTokenHash(
    userId: string,
    refreshTokenHash: string | null,
  ): Promise<void> {
    await this.userModel
      .findByIdAndUpdate(userId, { $set: { refreshTokenHash } })
      .exec();
  }
}
