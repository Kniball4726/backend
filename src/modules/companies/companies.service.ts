import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { AuthenticatedUser } from '../../common/enums/role.enum';
import { COLLECTION_NAMES } from '../../database/json-schemas/constants';
import {
  cleanCuit,
  formatCuit,
  validateCuit,
} from '../afip/domain/afip-cuit.validator';
import { AuditService } from '../master/services/audit.service';
import {
  CreateCompanyDto,
  UpdateBrandingDto,
  UpdateCompanyDto,
} from './dto/company.dto';

export interface CompanyBranding {
  logoUrl?: string | null;
  bannerUrl?: string | null;
  primaryColor?: string | null;
  slogan?: string | null;
  customSvg?: string | null;
}

export interface CompanyEntity {
  _id: Types.ObjectId;
  name: string;
  legalName: string;
  cuit: string;
  cuitFormatted: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
  address: string | null;
  phone: string | null;
  email: string | null;
  branding: CompanyBranding;
  isDefault: boolean;
  afipEnabled: boolean;
  mercadoPagoEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicBrandingInfo {
  companyId: string;
  companyName: string;
  legalName: string;
  cuit: string;
  slogan: string;
  logoUrl: string;
  bannerUrl: string;
  primaryColor: string;
  customSvg: string | null;
  status: string;
}

const DEFAULT_BRANDING: PublicBrandingInfo = {
  companyId: 'default',
  companyName: 'UltraTech Carreras',
  legalName: 'UltraTech Sports Nutrition S.A.',
  cuit: '30-71234567-9',
  slogan: 'ADVANCED TECHNOLOGY IN SPORTS NUTRITION',
  logoUrl: '/ultratech-carreras-logo.svg',
  bannerUrl: '/ultratech-carreras-banner.svg',
  primaryColor: '#D4AF37',
  customSvg: null,
  status: 'ACTIVE',
};

@Injectable()
export class CompaniesService implements OnModuleInit {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly auditService: AuditService,
  ) {}

  private get db() {
    if (!this.connection.db) {
      throw new ServiceUnavailableException('Base de datos no conectada');
    }
    return this.connection.db;
  }

  async onModuleInit() {
    await this.ensureDefaultCompany();
  }

  private async ensureDefaultCompany(): Promise<void> {
    if (!this.connection.db) return;
    try {
      const count = await this.db
        .collection(COLLECTION_NAMES.COMPANIES)
        .countDocuments();
      if (count === 0) {
        const id = new Types.ObjectId();
        const now = new Date();
        const initialDoc: CompanyEntity = {
          _id: id,
          name: DEFAULT_BRANDING.companyName,
          legalName: DEFAULT_BRANDING.legalName,
          cuit: cleanCuit(DEFAULT_BRANDING.cuit),
          cuitFormatted: DEFAULT_BRANDING.cuit,
          status: 'ACTIVE',
          address: 'Av. Corrientes 1234, CABA',
          phone: '+54 11 4321-8765',
          email: 'contacto@ultratech.com.ar',
          branding: {
            logoUrl: DEFAULT_BRANDING.logoUrl,
            bannerUrl: DEFAULT_BRANDING.bannerUrl,
            primaryColor: DEFAULT_BRANDING.primaryColor,
            slogan: DEFAULT_BRANDING.slogan,
            customSvg: null,
          },
          isDefault: true,
          afipEnabled: false,
          mercadoPagoEnabled: false,
          createdAt: now,
          updatedAt: now,
        };
        await this.db
          .collection(COLLECTION_NAMES.COMPANIES)
          .insertOne(initialDoc as any);
      }
    } catch {
      // Ignorar en entornos de pruebas aisladas si la DB no está lista en onModuleInit
    }
  }

  async getPublicBranding(companyId?: string): Promise<PublicBrandingInfo> {
    try {
      let doc: any = null;
      if (companyId && Types.ObjectId.isValid(companyId)) {
        doc = await this.db
          .collection(COLLECTION_NAMES.COMPANIES)
          .findOne({ _id: new Types.ObjectId(companyId) });
      }

      if (!doc) {
        // Buscar la empresa por defecto o la primera activa
        doc = await this.db
          .collection(COLLECTION_NAMES.COMPANIES)
          .findOne({ isDefault: true });
        if (!doc) {
          doc = await this.db
            .collection(COLLECTION_NAMES.COMPANIES)
            .findOne({ status: 'ACTIVE' });
        }
      }

      if (!doc) {
        return DEFAULT_BRANDING;
      }

      return {
        companyId: doc._id.toString(),
        companyName: doc.name || DEFAULT_BRANDING.companyName,
        legalName: doc.legalName || DEFAULT_BRANDING.legalName,
        cuit: doc.cuitFormatted || doc.cuit || DEFAULT_BRANDING.cuit,
        slogan: doc.branding?.slogan || DEFAULT_BRANDING.slogan,
        logoUrl: doc.branding?.logoUrl || DEFAULT_BRANDING.logoUrl,
        bannerUrl: doc.branding?.bannerUrl || DEFAULT_BRANDING.bannerUrl,
        primaryColor:
          doc.branding?.primaryColor || DEFAULT_BRANDING.primaryColor,
        customSvg: doc.branding?.customSvg || null,
        status: doc.status || 'ACTIVE',
      };
    } catch {
      return DEFAULT_BRANDING;
    }
  }

  async findAll(): Promise<CompanyEntity[]> {
    const docs = await this.db
      .collection(COLLECTION_NAMES.COMPANIES)
      .find()
      .sort({ isDefault: -1, createdAt: -1 })
      .toArray();

    return docs.map((d: any) => ({
      _id: d._id,
      name: d.name,
      legalName: d.legalName,
      cuit: d.cuit,
      cuitFormatted: d.cuitFormatted || formatCuit(d.cuit),
      status: d.status,
      address: d.address || null,
      phone: d.phone || null,
      email: d.email || null,
      branding: d.branding || {},
      isDefault: Boolean(d.isDefault),
      afipEnabled: Boolean(d.afipEnabled),
      mercadoPagoEnabled: Boolean(d.mercadoPagoEnabled),
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    }));
  }

  async findById(id: string): Promise<CompanyEntity> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('ID de empresa inválido');
    }
    const doc: any = await this.db
      .collection(COLLECTION_NAMES.COMPANIES)
      .findOne({ _id: new Types.ObjectId(id) });
    if (!doc) {
      throw new NotFoundException('Empresa no encontrada');
    }

    return {
      _id: doc._id,
      name: doc.name,
      legalName: doc.legalName,
      cuit: doc.cuit,
      cuitFormatted: doc.cuitFormatted || formatCuit(doc.cuit),
      status: doc.status,
      address: doc.address || null,
      phone: doc.phone || null,
      email: doc.email || null,
      branding: doc.branding || {},
      isDefault: Boolean(doc.isDefault),
      afipEnabled: Boolean(doc.afipEnabled),
      mercadoPagoEnabled: Boolean(doc.mercadoPagoEnabled),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async create(
    dto: CreateCompanyDto,
    actor: AuthenticatedUser,
  ): Promise<CompanyEntity> {
    const rawCuit = cleanCuit(dto.cuit);
    if (!validateCuit(rawCuit)) {
      throw new BadRequestException(
        `CUIT ${dto.cuit} inválido según algoritmo oficial de AFIP (Módulo 11)`,
      );
    }

    const existing = await this.db
      .collection(COLLECTION_NAMES.COMPANIES)
      .findOne({ cuit: rawCuit });
    if (existing) {
      throw new BadRequestException(
        `Ya existe una empresa registrada con el CUIT ${formatCuit(rawCuit)}`,
      );
    }

    const now = new Date();
    const id = new Types.ObjectId();

    const companyDoc: CompanyEntity = {
      _id: id,
      name: dto.name.trim(),
      legalName: dto.legalName.trim(),
      cuit: rawCuit,
      cuitFormatted: formatCuit(rawCuit),
      status: 'ACTIVE',
      address: dto.address?.trim() || null,
      phone: dto.phone?.trim() || null,
      email: dto.email?.trim() || null,
      branding: {
        logoUrl: dto.branding?.logoUrl || '/ultratech-carreras-logo.svg',
        bannerUrl: dto.branding?.bannerUrl || '/ultratech-carreras-banner.svg',
        primaryColor: dto.branding?.primaryColor || '#D4AF37',
        slogan:
          dto.branding?.slogan || 'ADVANCED TECHNOLOGY IN SPORTS NUTRITION',
        customSvg: dto.branding?.customSvg || null,
      },
      isDefault: false,
      afipEnabled: false,
      mercadoPagoEnabled: false,
      createdAt: now,
      updatedAt: now,
    };

    await this.db
      .collection(COLLECTION_NAMES.COMPANIES)
      .insertOne(companyDoc as any);

    await this.auditService.recordAuditLog({
      action: 'COMPANY_CREATED',
      actor,
      targetCollection: COLLECTION_NAMES.COMPANIES,
      targetId: id.toString(),
      metadata: {
        companyName: companyDoc.name,
        cuit: companyDoc.cuitFormatted,
      },
    });

    return companyDoc;
  }

  async update(
    id: string,
    dto: UpdateCompanyDto,
    actor: AuthenticatedUser,
  ): Promise<CompanyEntity> {
    const existing = await this.findById(id);
    const updates: Record<string, any> = { updatedAt: new Date() };

    if (dto.name !== undefined) updates.name = dto.name.trim();
    if (dto.legalName !== undefined) updates.legalName = dto.legalName.trim();
    if (dto.address !== undefined) updates.address = dto.address?.trim() || null;
    if (dto.phone !== undefined) updates.phone = dto.phone?.trim() || null;
    if (dto.email !== undefined) updates.email = dto.email?.trim() || null;
    if (dto.status !== undefined) updates.status = dto.status;

    if (dto.cuit !== undefined) {
      const rawCuit = cleanCuit(dto.cuit);
      if (!validateCuit(rawCuit)) {
        throw new BadRequestException(
          `CUIT ${dto.cuit} inválido según AFIP (Módulo 11)`,
        );
      }
      const duplicate = await this.db
        .collection(COLLECTION_NAMES.COMPANIES)
        .findOne({ cuit: rawCuit, _id: { $ne: new Types.ObjectId(id) } });
      if (duplicate) {
        throw new BadRequestException(
          `El CUIT ${formatCuit(rawCuit)} ya está registrado por otra empresa`,
        );
      }
      updates.cuit = rawCuit;
      updates.cuitFormatted = formatCuit(rawCuit);
    }

    if (dto.branding !== undefined) {
      updates.branding = {
        ...existing.branding,
        ...dto.branding,
      };
    }

    await this.db
      .collection(COLLECTION_NAMES.COMPANIES)
      .updateOne({ _id: new Types.ObjectId(id) }, { $set: updates });

    await this.auditService.recordAuditLog({
      action: 'COMPANY_UPDATED',
      actor,
      targetCollection: COLLECTION_NAMES.COMPANIES,
      targetId: id,
      metadata: { updatedFields: Object.keys(updates) },
    });

    return this.findById(id);
  }

  async toggleStatus(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<CompanyEntity> {
    const existing = await this.findById(id);
    const newStatus = existing.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';

    await this.db
      .collection(COLLECTION_NAMES.COMPANIES)
      .updateOne(
        { _id: new Types.ObjectId(id) },
        { $set: { status: newStatus, updatedAt: new Date() } },
      );

    await this.auditService.recordAuditLog({
      action: 'COMPANY_STATUS_TOGGLED',
      actor,
      targetCollection: COLLECTION_NAMES.COMPANIES,
      targetId: id,
      metadata: { previousStatus: existing.status, newStatus },
    });

    return this.findById(id);
  }

  async updateBranding(
    companyId: string | null | undefined,
    dto: UpdateBrandingDto,
    actor: AuthenticatedUser,
  ): Promise<PublicBrandingInfo> {
    let targetDoc: any = null;
    if (companyId && Types.ObjectId.isValid(companyId)) {
      targetDoc = await this.db
        .collection(COLLECTION_NAMES.COMPANIES)
        .findOne({ _id: new Types.ObjectId(companyId) });
    }

    if (!targetDoc) {
      targetDoc = await this.db
        .collection(COLLECTION_NAMES.COMPANIES)
        .findOne({ isDefault: true });
      if (!targetDoc) {
        targetDoc = await this.db
          .collection(COLLECTION_NAMES.COMPANIES)
          .findOne({ status: 'ACTIVE' });
      }
    }

    if (!targetDoc) {
      throw new NotFoundException('No se encontró ninguna empresa para configurar la marca');
    }

    const currentBranding = targetDoc.branding || {};
    const updatedBranding: CompanyBranding = {
      logoUrl: dto.logoUrl !== undefined ? dto.logoUrl : currentBranding.logoUrl,
      bannerUrl:
        dto.bannerUrl !== undefined ? dto.bannerUrl : currentBranding.bannerUrl,
      primaryColor:
        dto.primaryColor !== undefined
          ? dto.primaryColor
          : currentBranding.primaryColor,
      slogan: dto.slogan !== undefined ? dto.slogan : currentBranding.slogan,
      customSvg:
        dto.customSvg !== undefined ? dto.customSvg : currentBranding.customSvg,
    };

    const updates: Record<string, any> = {
      branding: updatedBranding,
      updatedAt: new Date(),
    };

    if (dto.companyName?.trim()) {
      updates.name = dto.companyName.trim();
    }
    if (dto.legalName?.trim()) {
      updates.legalName = dto.legalName.trim();
    }

    await this.db
      .collection(COLLECTION_NAMES.COMPANIES)
      .updateOne({ _id: targetDoc._id }, { $set: updates });

    await this.auditService.recordAuditLog({
      action: 'BRANDING_UPDATED',
      actor,
      targetCollection: COLLECTION_NAMES.COMPANIES,
      targetId: targetDoc._id.toString(),
      metadata: {
        companyName: updates.name || targetDoc.name,
        logoUpdated: Boolean(dto.logoUrl || dto.customSvg),
      },
    });

    return this.getPublicBranding(targetDoc._id.toString());
  }
}
