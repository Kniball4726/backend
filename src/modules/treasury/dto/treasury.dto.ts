import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const OpenRegisterSchema = z.object({
  boxType: z.enum(['Ventas Sucursal', 'Caja Consolidada']),
  branch: z.string().trim().min(2).max(60).optional().default('PASTEUR'),
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
  branch: z.string().trim().min(2).max(60).optional().default('PASTEUR'),
  registerId: z.string().trim().optional().nullable(),
});

export class CreateCashOperationDto extends createZodDto(
  CreateCashOperationSchema,
) {}
