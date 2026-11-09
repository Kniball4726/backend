import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Model, Types } from 'mongoose';
import { BranchName, UserRole } from '../../common/enums/role.enum';
import { CreateUserDto } from './dto/user.dto';
import { User, UserDocument } from './schemas/user.schema';

export interface UserSummary {
  _id: Types.ObjectId | string;
  email: string;
  fullName: string;
  role: UserRole;
  branch: BranchName;
  createdAt?: Date;
  updatedAt?: Date;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async create(dto: CreateUserDto, requesterRole?: UserRole) {
    if (dto.role === UserRole.ADMIN && requesterRole !== UserRole.MASTER) {
      throw new ForbiddenException(
        'Solo el usuario MASTER puede crear usuarios con rol ADMIN',
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

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const created = await this.userModel.create({
      email: dto.email.toLowerCase(),
      passwordHash,
      fullName: dto.fullName,
      role: dto.role,
      branch: dto.branch ?? BranchName.LOCALES,
      refreshTokenHash: null,
      isActive: true,
    });

    return {
      id: created._id.toString(),
      email: created.email,
      fullName: created.fullName,
      role: created.role,
      branch: created.branch,
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

    const filter: Record<string, unknown> = { _id: userId };
    if (requesterRole !== UserRole.MASTER) {
      filter.role = { $in: [UserRole.CRM, UserRole.CASHIER] };
    }

    const updated = await this.userModel
      .findOneAndUpdate(filter, { $set: { branch } }, { new: true })
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

  async findAll(requesterRole?: UserRole): Promise<UserSummary[]> {
    const filter =
      requesterRole === UserRole.MASTER
        ? {}
        : { role: { $in: [UserRole.CRM, UserRole.CASHIER] } };

    const users = await this.userModel
      .find(filter)
      .select('-passwordHash -refreshTokenHash')
      .sort({ createdAt: -1 })
      .lean();
    return users.map((u: any) => ({
      ...u,
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
