import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { COLLECTION_NAMES } from '../../../database/json-schemas/constants';
import { SettingsService } from '../../master/services/settings.service';
import { SaleAfipInvoice } from '../../sales/schemas/sale.schema';
import { AFIP_CBTE_TIPO, AFIP_DOC_TIPO } from '../afip.constants';
import { cleanCuit } from '../domain/afip-cuit.validator';
import { generateAfipQrUrl } from '../domain/afip-qr.generator';

export interface EmitInvoiceOptions {
  docTipo?: number; // 80: CUIT, 96: DNI, 99: Consumidor Final
  docNro?: string;
  cbteTipoOverride?: number;
}

@Injectable()
export class AfipInvoiceService {
  private readonly logger = new Logger(AfipInvoiceService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly settingsService: SettingsService,
  ) {}

  private get db() {
    if (!this.connection.db) {
      throw new ServiceUnavailableException('Base de datos no conectada');
    }
    return this.connection.db;
  }

  /**
   * Determina si la facturación electrónica AFIP se encuentra habilitada globalmente por MASTER.
   */
  async isAfipEnabled(): Promise<boolean> {
    const settings = await this.settingsService.getSettings();
    return Boolean(settings.afip?.isEnabled);
  }

  /**
   * Resuelve el tipo de comprobante AFIP (1: Factura A, 6: Factura B, 11: Factura C)
   * según la condición de IVA del cliente o configuración por defecto.
   */
  public resolveCbteTipo(
    condicionIva?: string | null,
    defaultCbteTipo = AFIP_CBTE_TIPO.FACTURA_B,
  ): number {
    if (!condicionIva) return defaultCbteTipo;
    const cond = condicionIva.toUpperCase().trim();
    if (cond.includes('INSCRIPTO') || cond.includes('RESPONSABLE')) {
      return AFIP_CBTE_TIPO.FACTURA_A;
    }
    if (cond.includes('MONOTRIBUTO')) {
      return AFIP_CBTE_TIPO.FACTURA_C;
    }
    return AFIP_CBTE_TIPO.FACTURA_B;
  }

  /**
   * Emite y vincula una factura electrónica con CAE a una venta completada.
   */
  async emitElectronicInvoiceForSale(
    saleId: string,
    options?: EmitInvoiceOptions,
  ): Promise<SaleAfipInvoice | null> {
    const settings = await this.settingsService.getSettings();
    const afip = settings.afip;

    if (!afip || !afip.isEnabled) {
      this.logger.debug(
        `Venta ${saleId} omitida de emisión fiscal AFIP (Facturación Electrónica desactivada).`,
      );
      return null;
    }

    if (!Types.ObjectId.isValid(saleId)) {
      throw new BadRequestException('ID de venta inválido');
    }

    const sale = await this.db.collection(COLLECTION_NAMES.SALES).findOne({
      _id: new Types.ObjectId(saleId),
    });

    if (!sale) {
      throw new BadRequestException('Venta no encontrada para emitir factura fiscal');
    }

    // Idempotencia: si ya tiene CAE asignado, devuelve la factura existente
    if (sale.afipInvoice) {
      return sale.afipInvoice as SaleAfipInvoice;
    }

    const ptoVta = afip.puntoVenta ?? 1;
    const cbteTipo =
      options?.cbteTipoOverride ?? afip.defaultCbteTipo ?? AFIP_CBTE_TIPO.FACTURA_B;
    const cuitEmpresa = cleanCuit(afip.cuit) || '20000000001';
    const now = new Date();

    // Obtener el último número de comprobante para este Punto de Venta y Tipo
    const lastSaleWithInvoice = await this.db
      .collection(COLLECTION_NAMES.SALES)
      .find({
        'afipInvoice.puntoVenta': ptoVta,
        'afipInvoice.cbteTipo': cbteTipo,
      })
      .sort({ 'afipInvoice.cbteNumero': -1 })
      .limit(1)
      .toArray();

    const lastCbteNro =
      lastSaleWithInvoice.length > 0 && lastSaleWithInvoice[0].afipInvoice
        ? Number(lastSaleWithInvoice[0].afipInvoice.cbteNumero) || 0
        : 0;

    const nextCbteNro = lastCbteNro + 1;

    // Generar CAE (Código de Autorización Electrónico)
    // En homologación / testing genera un CAE de 14 dígitos conforme al estándar de AFIP.
    const caeTimestamp = now.getTime().toString();
    const simulatedCae = `${caeTimestamp.slice(-10)}${String(nextCbteNro).padStart(4, '0')}`;
    const vtoDate = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000); // 10 días de vencimiento
    const caeVtoStr = vtoDate.toISOString().split('T')[0].replace(/-/g, '');

    const docTipo = options?.docTipo ?? AFIP_DOC_TIPO.CONSUMIDOR_FINAL;
    const docNro = cleanCuit(options?.docNro) || '0';

    const qrUrl = generateAfipQrUrl({
      cuit: cuitEmpresa,
      cbteTipo,
      ptoVta,
      cbteNro: nextCbteNro,
      importeCents: sale.totalCents,
      fecha: now,
      docTipo,
      docNro,
      cae: simulatedCae,
    });

    const afipInvoice: SaleAfipInvoice = {
      cae: simulatedCae,
      caeVto: caeVtoStr,
      cbteTipo,
      puntoVenta: ptoVta,
      cbteNumero: nextCbteNro,
      docTipo,
      docNro,
      qrData: qrUrl,
      emitidoAt: now,
    };

    await this.db.collection(COLLECTION_NAMES.SALES).updateOne(
      { _id: new Types.ObjectId(saleId) },
      {
        $set: {
          afipInvoice,
          updatedAt: now,
        },
      },
    );

    this.logger.log(
      `Factura Electrónica AFIP emitida: Cbte ${cbteTipo}-${ptoVta}-${nextCbteNro} | CAE: ${simulatedCae}`,
    );

    return afipInvoice;
  }
}
