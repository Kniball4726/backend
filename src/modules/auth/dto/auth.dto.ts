import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const LoginSchema = z.object({
  email: z.string().email('Correo electrónico inválido').toLowerCase(),
  password: z.string().min(1, 'Contraseña obligatoria'),
});

export class LoginDto extends createZodDto(LoginSchema) {}

export const RefreshTokenSchema = z.object({
  userId: z.string().min(1, 'ID de usuario requerido'),
  refreshToken: z.string().min(1, 'Refresh token requerido'),
});

export class RefreshTokenDto extends createZodDto(RefreshTokenSchema) {}
