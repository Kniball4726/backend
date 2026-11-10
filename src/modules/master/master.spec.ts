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
});
