import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { UserRole } from '../../common/enums/role.enum';
import { CompaniesService } from './companies.service';

describe('Companies & Multi-Tenant Branding Service', () => {
  let companiesService: CompaniesService;
  let mockCompaniesCol: any;
  let mockAuditService: any;

  beforeEach(() => {
    mockCompaniesCol = {
      insertOne: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      updateOne: jest.fn(),
      countDocuments: jest.fn(),
    };

    const mockDb = {
      collection: jest.fn().mockReturnValue(mockCompaniesCol),
    };

    const mockConnection = { db: mockDb };
    mockAuditService = {
      recordAuditLog: jest.fn().mockResolvedValue(undefined),
    };

    companiesService = new CompaniesService(
      mockConnection as any,
      mockAuditService,
    );
  });

  const mockActor = {
    sub: new Types.ObjectId().toString(),
    email: 'master@justimobile.com',
    fullName: 'Master Operator',
    role: UserRole.MASTER,
  };

  describe('Branding Público', () => {
    it('debe retornar branding por defecto cuando no hay empresas en la base de datos', async () => {
      mockCompaniesCol.findOne.mockResolvedValue(null);
      const branding = await companiesService.getPublicBranding();

      expect(branding.companyName).toBe('Comercio Principal (SaaS)');
      expect(branding.logoUrl).toBe('/justi-logo.svg');
      expect(branding.status).toBe('ACTIVE');
    });

    it('debe retornar branding personalizado cuando existe empresa configurada', async () => {
      const companyId = new Types.ObjectId();
      mockCompaniesCol.findOne.mockResolvedValue({
        _id: companyId,
        name: 'NutriSport Pro',
        legalName: 'NutriSport S.A.',
        cuit: '30712345679',
        cuitFormatted: '30-71234567-9',
        branding: {
          logoUrl: '/logos/nutrisport.svg',
          slogan: 'POTENCIA TU RENDIMIENTO',
        },
        status: 'ACTIVE',
      });

      const branding = await companiesService.getPublicBranding(
        companyId.toString(),
      );

      expect(branding.companyName).toBe('NutriSport Pro');
      expect(branding.logoUrl).toBe('/logos/nutrisport.svg');
      expect(branding.slogan).toBe('POTENCIA TU RENDIMIENTO');
    });
  });

  describe('Creación de Empresas Multi-Tenant', () => {
    it('debe rechazar la creación de una empresa si el CUIT es inválido según Módulo 11', async () => {
      await expect(
        companiesService.create(
          {
            name: 'Empresa Test',
            legalName: 'Test S.A.',
            cuit: '30-11111111-1', // CUIT inválido
          },
          mockActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe crear una nueva empresa con CUIT válido y registrar auditoría', async () => {
      mockCompaniesCol.findOne.mockResolvedValue(null);
      mockCompaniesCol.insertOne.mockResolvedValue({ acknowledged: true });

      const created = await companiesService.create(
        {
          name: 'Suplementos Express',
          legalName: 'Suplementos Express S.R.L.',
          cuit: '30-71234567-1', // CUIT válido de AFIP
          email: 'admin@express.com',
        },
        mockActor,
      );

      expect(created.name).toBe('Suplementos Express');
      expect(created.cuitFormatted).toBe('30-71234567-1');
      expect(created.status).toBe('ACTIVE');
      expect(mockCompaniesCol.insertOne).toHaveBeenCalledTimes(1);
      expect(mockAuditService.recordAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'COMPANY_CREATED',
        }),
      );
    });

    it('debe rechazar empresa con CUIT duplicado', async () => {
      mockCompaniesCol.findOne.mockResolvedValue({ _id: new Types.ObjectId() });

      await expect(
        companiesService.create(
          {
            name: 'Duplicado S.A.',
            legalName: 'Duplicado S.A.',
            cuit: '30-71234567-1',
          },
          mockActor,
        ),
      ).rejects.toThrow('Ya existe una empresa registrada');
    });
  });

  describe('Actualización de Marca y Logotipo', () => {
    it('debe actualizar el nombre de la app y logotipo SVG dinámicamente', async () => {
      const companyId = new Types.ObjectId();
      mockCompaniesCol.findOne.mockResolvedValue({
        _id: companyId,
        name: 'Comercio Modelo',
        legalName: 'Comercio Modelo S.A.',
        branding: { logoUrl: '/logo.svg' },
      });
      mockCompaniesCol.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const updated = await companiesService.updateBranding(
        companyId.toString(),
        {
          companyName: 'Comercio Modelo Plus',
          logoUrl: '/nuevo-logo.svg',
          slogan: 'INNOVACIÓN Y SERVICIO',
        },
        mockActor,
      );

      expect(mockCompaniesCol.updateOne).toHaveBeenCalledTimes(1);
      expect(mockAuditService.recordAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'BRANDING_UPDATED',
        }),
      );
    });
  });

  describe('Control de Estado de Empresas (Activar / Suspender)', () => {
    it('debe alternar el estado entre ACTIVE y SUSPENDED', async () => {
      const companyId = new Types.ObjectId();
      mockCompaniesCol.findOne.mockResolvedValue({
        _id: companyId,
        name: 'Sucursal Pilar',
        status: 'ACTIVE',
      });
      mockCompaniesCol.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const result = await companiesService.toggleStatus(
        companyId.toString(),
        mockActor,
      );

      expect(mockCompaniesCol.updateOne).toHaveBeenCalledWith(
        { _id: companyId },
        expect.objectContaining({
          $set: expect.objectContaining({ status: 'SUSPENDED' }),
        }),
      );
      expect(mockAuditService.recordAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'COMPANY_STATUS_TOGGLED',
        }),
      );
    });
  });
});
