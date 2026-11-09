import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const SaleItemInputSchema = z.object({
  productId: z.string().min(1, 'ID de producto obligatorio'),
  quantity: z.number().positive('La cantidad debe ser mayor a 0'),
});

export const SalePaymentInputSchema = z.object({
  method: z.enum(['CASH', 'CARD', 'TRANSFER']),
  amountCents: z.number().int().min(0),
  reference: z.string().trim().nullish().default(null),
});

export const PreviewSaleSchema = z.object({
  items: z
    .array(SaleItemInputSchema)
    .min(1, 'La venta debe contener al menos un producto'),
  customerId: z.string().nullish(),
  applyCustomerDiscount: z.boolean().default(false),
});

export class PreviewSaleDto extends createZodDto(PreviewSaleSchema) {}

export const CreateSaleSchema = PreviewSaleSchema.extend({
  idempotencyKey: z
    .string()
    .min(8, 'Se requiere un idempotencyKey único (ej. UUIDv4)')
    .optional(),
  payments: z
    .array(SalePaymentInputSchema)
    .min(1, 'Se requiere al menos un método de pago'),
  deviceTimestamp: z.string().datetime().optional(),
});

export class CreateSaleDto extends createZodDto(CreateSaleSchema) {}

export const CancelSaleSchema = z.object({
  reason: z.string().trim().max(300).optional(),
});

export class CancelSaleDto extends createZodDto(CancelSaleSchema) {}
