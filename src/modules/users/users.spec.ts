import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { BranchName, UserRole } from '../../common/enums/role.enum';
import { UsersService } from './users.service';

describe('Users Module (UsersService)', () => {
  let usersService: UsersService;
  let mockUserModel: any;

  beforeEach(() => {
    mockUserModel = {
      findOne: jest.fn(),
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
    };
    usersService = new UsersService(mockUserModel);
  });

  describe('Creación de Usuarios', () => {
    it('debe impedir que un rol ADMIN o CASHIER cree usuarios con rol ADMIN (solo MASTER)', async () => {
      await expect(
        usersService.create(
          {
            email: 'nuevo.admin@justimobile.com',
            fullName: 'Nuevo Admin',
            role: UserRole.ADMIN,
            password: 'Password123!',
            branch: BranchName.LOCALES,
          },
          UserRole.ADMIN,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('debe rechazar la creación si el correo ya existe en la base de datos', async () => {
      mockUserModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), email: 'cajero@justimobile.com' }),
      });

      await expect(
        usersService.create(
          {
            email: 'cajero@justimobile.com',
            fullName: 'Cajero Existente',
            role: UserRole.CASHIER,
            password: 'Password123!',
            branch: BranchName.LOCALES,
          },
          UserRole.ADMIN,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('debe crear un usuario CASHIER exitosamente con sucursal por defecto LOCALES', async () => {
      mockUserModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      const fakeUser = {
        _id: new Types.ObjectId(),
        email: 'daniel@justimobile.com',
        fullName: 'Daniel Cajero',
        role: UserRole.CASHIER,
        branch: BranchName.LOCALES,
        isActive: true,
        createdAt: new Date(),
      };

      mockUserModel.create.mockResolvedValue(fakeUser);

      const result = await usersService.create(
        {
          email: 'daniel@justimobile.com',
          fullName: 'Daniel Cajero',
          role: UserRole.CASHIER,
          password: 'Password123!',
          branch: BranchName.LOCALES,
        },
        UserRole.ADMIN,
      );

      expect(result.email).toBe('daniel@justimobile.com');
      expect(result.role).toBe(UserRole.CASHIER);
      expect(result.branch).toBe(BranchName.LOCALES);
    });
  });

  describe('Asignación de Sucursal', () => {
    it('debe lanzar NotFoundException si el ID de usuario es inválido', async () => {
      await expect(
        usersService.assignBranch('id-invalido', BranchName.CARRERAS, UserRole.ADMIN),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe permitir a un ADMIN cambiar la sucursal de un CASHIER', async () => {
      const validId = new Types.ObjectId().toString();
      mockUserModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: validId,
          role: UserRole.CASHIER,
          branch: BranchName.LOCALES,
        }),
      });

      mockUserModel.findByIdAndUpdate.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: validId,
            fullName: 'Daniel',
            email: 'daniel@justi.com',
            role: UserRole.CASHIER,
            branch: BranchName.CARRERAS,
          }),
        }),
      });

      const updated = await usersService.assignBranch(validId, BranchName.CARRERAS, UserRole.ADMIN);
      expect(updated.branch).toBe(BranchName.CARRERAS);
    });
  });

  describe('Listado de Usuarios y Ocultamiento de Credenciales', () => {
    it('debe listar solo CRM y CASHIER para un ADMIN, excluyendo hashes de contraseñas', async () => {
      const usersInDb = [
        { _id: new Types.ObjectId(), fullName: 'Master User', role: UserRole.MASTER, branch: BranchName.LOCALES },
        { _id: new Types.ObjectId(), fullName: 'Admin User', role: UserRole.ADMIN, branch: BranchName.LOCALES },
        { _id: new Types.ObjectId(), fullName: 'Cajero 1', role: UserRole.CASHIER, branch: BranchName.LOCALES },
        { _id: new Types.ObjectId(), fullName: 'CRM 1', role: UserRole.CRM, branch: BranchName.CARRERAS },
      ];

      mockUserModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(usersInDb),
          }),
        }),
      });

      const listForAdmin = await usersService.findAll(UserRole.ADMIN);
      expect(listForAdmin).toHaveLength(2);
      expect(listForAdmin.map((u) => u.role)).toEqual([UserRole.CASHIER, UserRole.CRM]);
    });
  });
});
