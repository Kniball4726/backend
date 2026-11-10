import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { BranchName, UserRole } from '../../../common/enums/role.enum';

export const CreateUserSchema = z.object({
  email: z.string().email('Debe ser un correo electrónico válido').toLowerCase(),
  password: z
    .string()
    .min(6, 'La contraseña debe tener al menos 6 caracteres'),
  fullName: z.string().min(2, 'El nombre completo es obligatorio').trim(),
  role: z
    .enum([UserRole.ADMIN, UserRole.CRM, UserRole.CASHIER])
    .default(UserRole.CASHIER),
  branch: z
    .enum([BranchName.LOCALES, BranchName.CARRERAS])
    .default(BranchName.LOCALES),
  companyId: z.string().trim().nullish(),
});

export class CreateUserDto extends createZodDto(CreateUserSchema) {}

export const AssignUserBranchSchema = z.object({
  branch: z.enum([BranchName.LOCALES, BranchName.CARRERAS]),
});

export class AssignUserBranchDto extends createZodDto(AssignUserBranchSchema) {}
