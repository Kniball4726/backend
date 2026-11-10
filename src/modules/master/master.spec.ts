import { Types } from 'mongoose';
import { UserRole } from '../../common/enums/role.enum';
import { ApiKeysService } from './services/api-keys.service';

describe('Master Module (ApiKeysService & Security)', () => {
  let apiKeysService: ApiKeysService;
  let mockApiKeysCol: any;
  let mockAuditService: any;

  beforeEach(() => {
    mockApiKeysCol = {
      insertOne: jest.fn(),
      find: jest.fn(),
      findOneAndUpdate: jest.fn(),
    };

    const mockDb = {
      collection: jest.fn().mockReturnValue(mockApiKeysCol),
    };

    const mockConnection = { db: mockDb };
    mockAuditService = {
      recordAuditLog: jest.fn().mockResolvedValue(undefined),
    };

    apiKeysService = new ApiKeysService(mockConnection as any, mockAuditService);
  });

  describe('Generación de Claves API Externas (Zero-Knowledge Storage)', () => {
    it('debe generar una clave con prefijo jmk_live_, almacenar únicamente su hash SHA-256 y registrar auditoría', async () => {
      const actor = {
        sub: new Types.ObjectId().toString(),
        email: 'master@justimobile.com',
        fullName: 'Master User',
        role: UserRole.MASTER,
      };

      mockApiKeysCol.insertOne.mockResolvedValue({ acknowledged: true });

      const result = await apiKeysService.createApiKey(
        {
          name: 'Integración Ecommerce',
          scopes: ['sales:read'],
          expiresInDays: 30,
        },
        actor,
      );

      // Debe entregar la clave cruda solo una vez
      expect(result.apiKey).toMatch(/^jmk_live_[0-9a-f]{48}$/);
      expect(result.name).toBe('Integración Ecommerce');

      // Debe insertar en base de datos el hash, no la clave plana
      expect(mockApiKeysCol.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Integración Ecommerce',
          keyHash: expect.any(String),
          isActive: true,
        }),
      );

      // Debe registrar evento en la bitácora inmutable de auditoría
      expect(mockAuditService.recordAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'API_KEY_CREATED',
          actor,
        }),
      );
    });

    it('debe revocar una clave API desactivándola y registrando auditoría', async () => {
      const actor = {
        sub: new Types.ObjectId().toString(),
        email: 'master@justimobile.com',
        fullName: 'Master User',
        role: UserRole.MASTER,
      };

      const keyId = new Types.ObjectId().toString();
      mockApiKeysCol.findOneAndUpdate.mockResolvedValue({
        _id: new Types.ObjectId(keyId),
        name: 'Clave Antigua',
        isActive: false,
      });

      const res = await apiKeysService.revokeApiKey(keyId, actor);
      expect(res.isActive).toBe(false);
      expect(mockAuditService.recordAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'API_KEY_REVOKED',
          actor,
        }),
      );
    });
  });

  describe('Administración de Mercado Pago Exclusiva de MASTER', () => {
    it('debe enmascarar los tokens de acceso con Zero-Knowledge y registrar auditoría de cambios', async () => {
      const mockSettingsCol = {
        findOne: jest.fn().mockResolvedValue({
          key: 'GLOBAL_CONFIG',
          mercadoPago: {
            isEnabled: true,
            isSandbox: false,
            publicKey: 'APP_USR-pub-test-1234',
            accessToken: 'APP_USR-9876543210-abcdef-1234',
            webhookSecret: 'whsec_secret_123',
            posId: 'SUCURSAL_LOCALES_1',
            userId: '12345678',
            updatedAt: new Date(),
          },
        }),
        updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
      };

      const mockDb = {
        collection: jest.fn().mockReturnValue(mockSettingsCol),
      };

      const mockConn = { db: mockDb };
      const { SettingsService } = await import('./services/settings.service');
      const { MercadoPagoMasterService } = await import(
        './services/mercadopago-master.service'
      );

      const settingsService = new SettingsService(mockConn as any, mockAuditService);
      const mpMasterService = new MercadoPagoMasterService(
        mockConn as any,
        settingsService,
        mockAuditService,
      );

      const settings = await mpMasterService.getSettings(true);
      expect(settings.isEnabled).toBe(true);
      expect(settings.hasAccessToken).toBe(true);
      expect(settings.accessTokenMasked).toContain('****');
      expect(settings.accessTokenMasked).not.toBe('APP_USR-9876543210-abcdef-1234');

      const actor = {
        sub: new Types.ObjectId().toString(),
        email: 'master@justimobile.com',
        fullName: 'Master User',
        role: UserRole.MASTER,
      };

      // Si se envía el token con máscara, debe conservar el token original
      await mpMasterService.updateSettings(
        {
          isEnabled: true,
          isSandbox: false,
          accessToken: 'APP_USR-****-****-1234',
          posId: 'SUCURSAL_LOCALES_2',
        },
        actor,
      );

      expect(mockSettingsCol.updateOne).toHaveBeenCalledWith(
        { key: 'GLOBAL_CONFIG' },
        expect.objectContaining({
          $set: expect.objectContaining({
            mercadoPago: expect.objectContaining({
              accessToken: 'APP_USR-9876543210-abcdef-1234',
              posId: 'SUCURSAL_LOCALES_2',
            }),
          }),
        }),
        { upsert: true },
      );

      expect(mockAuditService.recordAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'MASTER_MERCADOPAGO_SETTINGS_UPDATED',
          actor,
        }),
      );
    });
  });
});
