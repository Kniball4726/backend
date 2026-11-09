import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateCategorySchema = z.object({
  name: z.string().min(2, 'Nombre de categoría obligatorio').trim(),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, 'El slug solo puede contener minúsculas, números y guiones'),
  colorHex: z.string().optional().default('#2563EB'),
  sortOrder: z.number().int().optional().default(0),
});

export class CreateCategoryDto extends createZodDto(CreateCategorySchema) {}

export const CreateProductSchema = z.object({
  categoryId: z.string().min(1, 'Categoría obligatoria'),
  sku: z.string().min(1, 'SKU obligatorio').toUpperCase().trim(),
  barcode: z.string().trim().nullish().default(null),
  name: z.string().min(2, 'Nombre del producto obligatorio').trim(),
  priceCents: z
    .number()
    .int('El precio debe expresarse en centavos enteros (ej. $45.00 = 4500)')
    .min(0),
  costCents: z.number().int().min(0).default(0),
  taxRateBasisPoints: z
    .number()
    .int()
    .min(0)
    .max(10000)
    .default(1600),
  trackInventory: z.boolean().default(true),
  initialStock: z.number().min(0).default(0),
  minStockAlert: z.number().min(0).default(5),
  unit: z.enum(['UNIT', 'KG', 'LITER']).default('UNIT'),
});

export class CreateProductDto extends createZodDto(CreateProductSchema) {}

export const UpdateProductSchema = CreateProductSchema.omit({
  initialStock: true,
})
  .extend({
    isActive: z.boolean().optional(),
    stock: z.number().min(0).optional(),
  })
  .partial();

export class UpdateProductDto extends createZodDto(UpdateProductSchema) {}
