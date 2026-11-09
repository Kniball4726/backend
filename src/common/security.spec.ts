import {
  ExecutionContext,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'crypto';
import { Types } from 'mongoose';
import { AuthService } from '../modules/auth/auth.service';
import { LoginSchema } from '../modules/auth/dto/auth.dto';
import { CrmService } from '../modules/crm/crm.service';
import { CreateOrLoadCustomerSchema } from '../modules/crm/dto/customer.dto';
import { ApiKeysService } from '../modules/master/services/api-keys.service';
import { SalesService } from '../modules/sales/sales.service';
import { TreasuryService } from '../modules/treasury/treasury.service';
import { CreateUserSchema } from '../modules/users/dto/user.dto';
import { AuthenticatedUser, UserRole } from './enums/role.enum';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

function createMockExecutionContext(params: {
  user?: AuthenticatedUser;
  headers?: Record<string, string>;
  method?: string;
  url?: string;
}): ExecutionContext {
  const req = {
    user: params.user,
    headers: params.headers || {},
    method: params.method || 'GET',
    url: params.url || '/api/v1/test',
  };
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;
}

describe('Suite de Pruebas de Seguridad del Backend (OWASP API Security)', () => {
  describe('1. Control de Acceso Basado en Roles (RBAC) y Anti-Escalación de Privilegios', () => {
    it('debe bloquear a un CAJERO (daniel) si intenta asignar descuentos en CRM o entrar a MASTER', () => {
      const reflector = {
        getAllAndOverride: jest
          .fn()
          .mockReturnValueOnce([UserRole.CRM, UserRole.ADMIN]),
      } as unknown as Reflector;

      const guard = new RolesGuard(reflector);
      const ctx = createMockExecutionContext({
        user: {
          sub: new Types.ObjectId().toString(),
          email: 'daniel@justimobile.com',
          fullName: 'Daniel (Cajero)',
          role: UserRole.CASHIER,
        },
      });

      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('debe bloquear a un ADMIN si intenta acceder a endpoints exclusivos del rol MASTER', () => {
      const reflector = {
        getAllAndOverride: jest.fn().mockReturnValueOnce([UserRole.MASTER]),
      } as unknown as Reflector;

      const guard = new RolesGuard(reflector);
      const ctx = createMockExecutionContext({
        user: {
          sub: new Types.ObjectId().toString(),
          email: 'admin@justimobile.com',
          fullName: 'Administrador General',
          role: UserRole.ADMIN,
        },
      });

      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('debe otorgar pase universal al usuario MASTER humano en cualquier módulo del sistema', () => {
      const reflector = {
        getAllAndOverride: jest.fn().mockReturnValueOnce([UserRole.CASHIER]),
      } as unknown as Reflector;

      const guard = new RolesGuard(reflector);
      const ctx = createMockExecutionContext({
        user: {
          sub: new Types.ObjectId().toString(),
          email: 'glrd4726ml@gmail.com',
          fullName: 'Master System Owner',
          role: UserRole.MASTER,
        },
      });

      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('debe impedir que se cree otro usuario con rol MASTER a través de CreateUserSchema', () => {
      const attempt = CreateUserSchema.safeParse({
        email: 'attacker@evil.com',
        password: 'Password123!',
        fullName: 'Attacker',
        role: 'MASTER',
      });

      expect(attempt.success).toBe(false);
    });
  });

  describe('2. Seguridad de Claves API Externas (X-API-Key, SHA-256 y Scopes)', () => {
    it('debe almacenar únicamente el hash SHA-256 de la API Key en MongoDB y nunca la clave en texto plano', async () => {
      let insertedDoc: Record<string, unknown> | null = null;
      const mockConnection = {
        db: {
          collection: jest.fn().mockReturnValue({
            insertOne: jest.fn().mockImplementation(async (doc) => {
              insertedDoc = doc;
            }),
          }),
        },
      };
      const mockAuditService = {
        recordAuditLog: jest.fn().mockResolvedValue(undefined),
      };

      const apiKeysService = new ApiKeysService(
        mockConnection as never,
        mockAuditService as never,
      );

      const response = await apiKeysService.createApiKey(
        {
          name: 'App Externa Ecommerce',
          scopes: ['catalog:read'],
          expiresInDays: 30,
        },
        {
          sub: new Types.ObjectId().toString(),
          email: 'glrd4726ml@gmail.com',
          fullName: 'Master',
          role: UserRole.MASTER,
        },
      );

      expect(response.apiKey).toMatch(/^jmk_live_[a-f0-9]{48}$/);
      expect(insertedDoc).not.toBeNull();
      // En base de datos NO existe la propiedad apiKey en texto plano
      expect(insertedDoc).not.toHaveProperty('apiKey');
      // El keyHash guardado coincide exactamente con el SHA-256 de la clave entregada
      const expectedHash = createHash('sha256')
        .update(response.apiKey)
        .digest('hex');
      expect(insertedDoc?.['keyHash']).toBe(expectedHash);
    });

    it('debe rechazar con 401 Unauthorized una X-API-Key inválida, revocada o expirada', async () => {
      const mockConnection = {
        db: {
          collection: jest.fn().mockReturnValue({
            findOneAndUpdate: jest.fn().mockResolvedValue(null),
          }),
        },
      };

      const jwtGuard = new JwtAuthGuard(mockConnection as never);
      const ctx = createMockExecutionContext({
        headers: { 'x-api-key': 'jmk_live_fake_or_revoked_key' },
      });

      await expect(jwtGuard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('debe bloquear con 403 Forbidden una API Key con scope "crm:read" si intenta escribir en CRM o acceder a MASTER', () => {
      const reflector = {
        getAllAndOverride: jest
          .fn()
          .mockReturnValueOnce([UserRole.CRM, UserRole.ADMIN])
          .mockReturnValueOnce(undefined),
      } as unknown as Reflector;

      const rolesGuard = new RolesGuard(reflector);

      // Intento de escritura POST en /api/v1/crm/customers teniendo solo crm:read
      const writeCtx = createMockExecutionContext({
        method: 'POST',
        url: '/api/v1/crm/customers',
        user: {
          sub: new Types.ObjectId().toString(),
          email: 'apikey@justimobile.external',
          fullName: 'API Key ReadOnly',
          role: UserRole.ADMIN,
          isApiKey: true,
          apiKeyPrefix: 'jmk_live_12345678',
          scopes: ['crm:read'],
        },
      });

      expect(() => rolesGuard.canActivate(writeCtx)).toThrow(
        ForbiddenException,
      );

      // Intento de una API Key con scope '*' de entrar a /api/v1/master
      const masterReflector = {
        getAllAndOverride: jest.fn().mockReturnValueOnce([UserRole.MASTER]),
      } as unknown as Reflector;
      const masterGuard = new RolesGuard(masterReflector);
      const masterCtx = createMockExecutionContext({
        method: 'GET',
        url: '/api/v1/master/settings',
        user: {
          sub: new Types.ObjectId().toString(),
          email: 'apikey@justimobile.external',
          fullName: 'API Key Wildcard',
          role: UserRole.ADMIN,
          isApiKey: true,
          apiKeyPrefix: 'jmk_live_wildcard',
          scopes: ['*'],
        },
      });

      expect(() => masterGuard.canActivate(masterCtx)).toThrow(
        ForbiddenException,
      );
    });
  });

  describe('3. Protección contra Inyección NoSQL, ReDoS y Ataques de Autenticación', () => {
    it('debe bloquear cargas de Inyección NoSQL ({ "$gt": "" }) en Login y CRM mediante Zod', () => {
      const noSqlLoginAttempt = LoginSchema.safeParse({
        email: { $gt: '' },
        password: { $ne: null },
      });
      expect(noSqlLoginAttempt.success).toBe(false);

      const noSqlCrmAttempt = CreateOrLoadCustomerSchema.safeParse({
        fullName: { $where: '1 == 1' },
        email: 'victim@correo.com',
        discountPercentage: 15,
      });
      expect(noSqlCrmAttempt.success).toBe(false);
    });

    it('debe rechazar el login de cuentas desactivadas (isActive: false) y tokens revocados por Kill-Switch', async () => {
      const mockUsersService = {
        findByEmail: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(),
          email: 'daniel@justimobile.com',
          passwordHash: '$2a$10$dummyhash',
          role: UserRole.CASHIER,
          isActive: false, // Cuenta bloqueada
        }),
        findById: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(),
          email: 'daniel@justimobile.com',
          role: UserRole.CASHIER,
          isActive: true,
          refreshTokenHash: null, // Revocado por Kill-Switch de MASTER
        }),
      };

      const authService = new AuthService(
        mockUsersService as never,
        {} as never,
        {} as never,
      );

      await expect(
        authService.login({
          email: 'daniel@justimobile.com',
          password: 'Caja123!',
        }),
      ).rejects.toThrow(UnauthorizedException);

      await expect(
        authService.refreshTokens({
          userId: new Types.ObjectId().toString(),
          refreshToken: 'some_old_refresh_token',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('debe bloquear con 429 Too Many Requests tras 8 intentos fallidos consecutivos de login (Anti-Fuerza Bruta)', async () => {
      AuthService.resetRateLimitForTesting();
      const mockUsersService = {
        findByEmail: jest.fn().mockResolvedValue(null),
      };

      const authService = new AuthService(
        mockUsersService as never,
        {} as never,
        {} as never,
      );

      for (let i = 0; i < 8; i++) {
        await expect(
          authService.login({
            email: 'bruteforce@justimobile.com',
            password: 'WrongPassword!',
          }),
        ).rejects.toThrow(UnauthorizedException);
      }

      await expect(
        authService.login({
          email: 'bruteforce@justimobile.com',
          password: 'WrongPassword!',
        }),
      ).rejects.toThrow(/Demasiados intentos fallidos/);
      AuthService.resetRateLimitForTesting();
    });
  });

  describe('4. Seguridad de Reglas de Negocio (Topes MASTER, Kill-Switch y Anti-Doble Descuento)', () => {
    it('debe impedir que el rol CRM asigne un descuento mayor al tope configurado por MASTER', async () => {
      const mockMasterService = {
        getSettings: jest.fn().mockResolvedValue({
          maxCrmDiscountPercentage: 25, // Tope máximo fijado por MASTER en 25%
          maintenanceMode: { posPaused: false, crmPaused: false, reason: null },
        }),
      };

      const crmService = new CrmService(
        {} as never,
        mockMasterService as never,
      );

      await expect(
        crmService.registerCustomerWithDiscount(
          {
            fullName: 'Cliente Prueba',
            email: 'cliente@prueba.com',
            discountPercentage: 50, // Intenta asignar 50% (> 25%)
          },
          new Types.ObjectId().toString(),
        ),
      ).rejects.toThrow(/supera el tope máximo permitido/);
    });

    it('debe bloquear cobros en el POS (503 Service Unavailable) cuando MASTER activa el Modo Mantenimiento', async () => {
      const mockMasterService = {
        getSettings: jest.fn().mockResolvedValue({
          maxCrmDiscountPercentage: 100,
          maintenanceMode: {
            posPaused: true,
            crmPaused: false,
            reason: 'Auditoría de inventario en curso',
          },
        }),
      };

      const salesService = new SalesService(
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        mockMasterService as never,
      );

      await expect(
        salesService.createSale(
          {
            items: [{ productId: new Types.ObjectId().toString(), quantity: 1 }],
            payments: [{ method: 'CASH', amountCents: 5000, reference: null }],
            applyCustomerDiscount: false,
          },
          new Types.ObjectId().toString(),
          'uuid-idempotency-12345',
        ),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('debe impedir reutilizar un descuento CRM de un solo uso que ya fue consumido en una compra previa', async () => {
      const mockCustomerModel = {
        findOneAndUpdate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null), // MongoDB no encuentra activeDiscount.isAvailable === true
        }),
      };

      const crmService = new CrmService(mockCustomerModel as never);

      await expect(
        crmService.consumeCustomerDiscountInTransaction(
          new Types.ObjectId().toString(),
          'POS-20261109-SECOND',
        ),
      ).rejects.toThrow(/no tiene un descuento vigente disponible/);
    });

    it('debe aislar ventas y cierres de caja entre dos vendedores con el mismo rol CASHIER (Anti-BOLA / Multi-Vendedor)', async () => {
      const sellerAId = new Types.ObjectId();
      const sellerBId = new Types.ObjectId();

      const sellerAUser: AuthenticatedUser = {
        sub: sellerAId.toString(),
        email: 'vendedor1@justimobile.com',
        fullName: 'Vendedor 1',
        role: UserRole.CASHIER,
      };

      // 1. En Ventas: Vendedor 1 no puede consultar un ticket de Vendedor 2
      const mockSaleModel = {
        find: jest.fn().mockImplementation((filter: Record<string, unknown>) => ({
          sort: () => ({
            limit: () => ({
              lean: async () => [{ filterUsed: filter }],
            }),
          }),
        })),
        findOne: jest.fn().mockReturnValue({
          lean: async () => ({
            receiptNumber: 'POS-20261109-SELLB',
            cashierId: sellerBId, // Pertenece a Vendedor 2
          }),
        }),
      };

      const salesService = new SalesService(
        {} as never,
        mockSaleModel as never,
        {} as never,
        {} as never,
        {} as never,
      );

      const salesList = (await salesService.findAllSales(
        50,
        sellerAUser,
      )) as unknown as Array<{ filterUsed: { cashierId: Types.ObjectId } }>;
      expect(salesList[0].filterUsed.cashierId.toString()).toBe(
        sellerAId.toString(),
      );

      await expect(
        salesService.findByReceiptNumber('POS-20261109-SELLB', sellerAUser),
      ).rejects.toThrow(ForbiddenException);

      // 2. En Tesorería: Vendedor 1 no puede cerrar la caja abierta de Vendedor 2
      const registerBId = new Types.ObjectId();
      const mockTreasuryConnection = {
        db: {
          collection: jest.fn().mockReturnValue({
            findOne: jest.fn().mockResolvedValue({
              _id: registerBId,
              userId: sellerBId,
              userFullName: 'Vendedor 2',
              branch: 'PASTEUR',
              boxType: 'Ventas Sucursal',
              status: 'ABIERTA',
            }),
          }),
        },
      };

      const treasuryService = new TreasuryService(
        mockTreasuryConnection as never,
      );

      await expect(
        treasuryService.closeRegister(registerBId.toString(), sellerAUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
