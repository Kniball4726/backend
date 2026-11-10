import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { BranchName } from '../../../common/enums/role.enum';

export const OpenRegisterSchema = z.object({
  boxType: z.enum(['Ventas Sucursal', 'Caja Consolidada']),
  branch: z
    .enum([BranchName.LOCALES, BranchName.CARRERAS])
    .optional()
    .default(BranchName.LOCALES),
  observations: z.string().trim().max(500).optional().default(''),
});

export class OpenRegisterDto extends createZodDto(OpenRegisterSchema) {}

export const CreateCashOperationSchema = z.object({
  type: z.enum([
    'INGRESO_EXTRAORDINARIO',
    'EGRESO_EXTRAORDINARIO',
    'TRANSFERENCIA_CAJAS',
    'GASTO',
  ]),
  amount: z.number().positive('El importe debe ser mayor a 0'),
  category: z.string().trim().max(120).optional().nullable(),
  detail: z.string().trim().min(1, 'El detalle es obligatorio').max(500),
  branch: z
    .enum([BranchName.LOCALES, BranchName.CARRERAS])
    .optional()
    .default(BranchName.LOCALES),
  registerId: z.string().trim().optional().nullable(),
});

export class CreateCashOperationDto extends createZodDto(
  CreateCashOperationSchema,
) {}

export const CloseRegisterSchema = z.object({
  declaredCash: z.number().min(0).optional(),
  observations: z.string().trim().max(500).optional().default(''),
});

export class CloseRegisterDto extends createZodDto(CloseRegisterSchema) {}
