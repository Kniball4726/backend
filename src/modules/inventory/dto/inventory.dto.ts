import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const AdjustStockSchema = z.object({
  productId: z.string().min(1, 'ID de producto obligatorio'),
  type: z.enum(['ADJUSTMENT', 'RESTOCK', 'RETURN']),
  quantityDelta: z
    .number()
    .refine((val) => val !== 0, 'La variación de stock no puede ser 0'),
  notes: z.string().trim().optional(),
});

export class AdjustStockDto extends createZodDto(AdjustStockSchema) {}
