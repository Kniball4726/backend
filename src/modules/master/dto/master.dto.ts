import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ApiKeyScopeEnum = z.enum([
  '*',
  'crm:read',
  'crm:write',
  'catalog:read',
  'catalog:write',
  'inventory:read',
  'inventory:write',
  'sales:read',
  'sales:write',
  'treasury:read',
  'treasury:write',
]);

export const CreateApiKeySchema = z.object({
  name: z
    .string()
    .min(2, 'Nombre de la aplicación externa obligatorio (ej. Landing Web CRM)')
    .trim(),
  scopes: z
    .array(ApiKeyScopeEnum)
    .min(1, 'Debes asignar al menos un scope a la clave API'),
  expiresInDays: z
    .number()
    .int()
    .min(1)
    .max(3650)
    .nullish()
    .describe('Días de vigencia opcionales (null = sin expiración)'),
});

export class CreateApiKeyDto extends createZodDto(CreateApiKeySchema) {}

export const UpdateSystemSettingsSchema = z.object({
  businessName: z.string().min(2).trim().optional(),
  receiptFooterText: z.string().trim().nullish(),
  maxCrmDiscountPercentage: z.number().int().min(0).max(100).optional(),
  defaultTaxRateBasisPoints: z.number().int().min(0).max(10000).optional(),
  maintenanceMode: z
    .object({
      posPaused: z.boolean(),
      crmPaused: z.boolean(),
      reason: z.string().trim().nullish(),
    })
    .optional(),
});

export class UpdateSystemSettingsDto extends createZodDto(
  UpdateSystemSettingsSchema,
) {}

export const CreateWebhookSchema = z.object({
  name: z.string().min(2, 'Nombre descriptivo del webhook obligatorio').trim(),
  targetUrl: z.string().url('Debe ser una URL válida (https://...)'),
  events: z
    .array(
      z.enum([
        'sale.completed',
        'sale.cancelled',
        'customer.discount_assigned',
      ]),
    )
    .min(1, 'Selecciona al menos un evento a notificar'),
});

export class CreateWebhookDto extends createZodDto(CreateWebhookSchema) {}

export const UpdateMercadoPagoSettingsSchema = z.object({
  isEnabled: z.boolean().default(false),
  isSandbox: z.boolean().default(true),
  publicKey: z.string().trim().max(250).nullish(),
  accessToken: z.string().trim().max(350).nullish(),
  webhookSecret: z.string().trim().max(250).nullish(),
  posId: z.string().trim().max(100).nullish(),
  userId: z.string().trim().max(100).nullish(),
});

export class UpdateMercadoPagoSettingsDto extends createZodDto(
  UpdateMercadoPagoSettingsSchema,
) {}
