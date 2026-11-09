import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Esquema para registrar un cliente en el CRM con:
 * - fullName (Nombres)
 * - email (Mail)
 * - discountPercentage (Descuento % de 1 uso)
 * La fecha y hora se registran automáticamente en el servidor.
 */
export const CreateOrLoadCustomerSchema = z.object({
  fullName: z
    .string()
    .min(2, 'El nombre del cliente debe tener al menos 2 caracteres')
    .trim(),
  email: z
    .string()
    .email('Debe proporcionar un correo electrónico válido')
    .toLowerCase()
    .trim(),
  discountPercentage: z
    .number()
    .int('El porcentaje de descuento debe ser un número entero')
    .min(0, 'El descuento mínimo es 0%')
    .max(100, 'El descuento máximo es 100%'),
});

export class CreateOrLoadCustomerDto extends createZodDto(
  CreateOrLoadCustomerSchema,
) {}

export const AssignDiscountSchema = z.object({
  discountPercentage: z
    .number()
    .int('El porcentaje de descuento debe ser un número entero')
    .min(1, 'El descuento a cargar debe ser entre 1% y 100%')
    .max(100, 'El descuento máximo es 100%'),
});

export class AssignDiscountDto extends createZodDto(AssignDiscountSchema) {}
