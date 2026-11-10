import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CompanyStatusEnum = z.enum(['ACTIVE', 'SUSPENDED', 'INACTIVE']);
export type CompanyStatus = z.infer<typeof CompanyStatusEnum>;

export const CompanyBrandingSchema = z.object({
  logoUrl: z.string().trim().nullish(),
  bannerUrl: z.string().trim().nullish(),
  primaryColor: z.string().trim().nullish(),
  slogan: z.string().trim().nullish(),
  customSvg: z.string().trim().nullish(),
});

export const CreateCompanySchema = z.object({
  name: z
    .string()
    .min(2, 'El nombre de fantasía debe tener al menos 2 caracteres')
    .trim(),
  legalName: z
    .string()
    .min(2, 'La razón social debe tener al menos 2 caracteres')
    .trim(),
  cuit: z
    .string()
    .min(10, 'El CUIT debe contener 11 dígitos')
    .max(13)
    .trim(),
  address: z.string().trim().nullish(),
  phone: z.string().trim().nullish(),
  email: z.string().email('Formato de email inválido').trim().nullish(),
  branding: CompanyBrandingSchema.optional(),
});

export class CreateCompanyDto extends createZodDto(CreateCompanySchema) {}

export const UpdateCompanySchema = CreateCompanySchema.partial().extend({
  status: CompanyStatusEnum.optional(),
});

export class UpdateCompanyDto extends createZodDto(UpdateCompanySchema) {}

export const UpdateBrandingSchema = z.object({
  companyName: z.string().min(2).trim().optional(),
  legalName: z.string().trim().nullish(),
  slogan: z.string().trim().nullish(),
  logoUrl: z.string().trim().nullish(),
  bannerUrl: z.string().trim().nullish(),
  primaryColor: z.string().trim().nullish(),
  customSvg: z.string().trim().nullish(),
});

export class UpdateBrandingDto extends createZodDto(UpdateBrandingSchema) {}
