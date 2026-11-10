import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SettingsService } from '../../master/services/settings.service';

export interface CreateQrOrderParams {
  totalPesos: number;
  title?: string;
  externalReference: string;
  cashierBranch?: string;
  cashierName?: string;
}

export interface QrOrderResult {
  isAvailable: boolean;
  message?: string;
  externalReference: string;
  qrData?: string;
  qrImageUrl?: string;
  initPoint?: string;
  status: 'pending' | 'approved' | 'rejected' | 'disabled';
}

@Injectable()
export class MercadoPagoPosService {
  private readonly logger = new Logger(MercadoPagoPosService.name);

  constructor(private readonly settingsService: SettingsService) {}

  async createQrOrder(params: CreateQrOrderParams): Promise<QrOrderResult> {
    const settings = await this.settingsService.getSettings();
    const mp = settings.mercadoPago;

    if (!mp || !mp.isEnabled || !mp.accessToken) {
      return {
        isAvailable: false,
        status: 'disabled',
        externalReference: params.externalReference,
        message:
          'El cobro con QR Mercado Pago se encuentra deshabilitado o sin credenciales configuradas por el usuario MASTER.',
      };
    }

    const isSandbox = Boolean(mp.isSandbox);
    const token = mp.accessToken.trim();

    try {
      const preferencePayload = {
        items: [
          {
            title: params.title || 'Compra JustiMobile Suplementos',
            quantity: 1,
            currency_id: 'ARS',
            unit_price: Number(params.totalPesos.toFixed(2)),
          },
        ],
        external_reference: params.externalReference,
        statement_descriptor: 'JUSTIMOBILE',
        notification_url: 'https://justimobileapi.onrender.com/api/v1/sales/mercadopago/webhook',
        metadata: {
          branch: params.cashierBranch || 'LOCALES',
          cashier: params.cashierName || 'Operador POS',
        },
      };

      const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'JustiMobile-POS-Client/1.0',
        },
        body: JSON.stringify(preferencePayload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data) {
        const errorMsg =
          data?.message || data?.error || `Error HTTP ${res.status}`;
        this.logger.error(`Error al generar Preference de Mercado Pago: ${errorMsg}`);
        throw new BadRequestException(
          `No se pudo generar la orden de Mercado Pago: ${errorMsg}`,
        );
      }

      const targetUrl =
        isSandbox && data.sandbox_init_point
          ? data.sandbox_init_point
          : data.init_point;

      const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
        targetUrl,
      )}`;

      return {
        isAvailable: true,
        status: 'pending',
        externalReference: params.externalReference,
        initPoint: targetUrl,
        qrData: targetUrl,
        qrImageUrl,
      };
    } catch (err: unknown) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      this.logger.error(`Fallo en MercadoPagoPosService.createQrOrder: ${msg}`);
      throw new ServiceUnavailableException(
        `Error de comunicación con la pasarela Mercado Pago: ${msg}`,
      );
    }
  }

  async checkPaymentStatus(externalReference: string) {
    const settings = await this.settingsService.getSettings();
    const mp = settings.mercadoPago;

    if (!mp || !mp.accessToken) {
      return {
        isPaid: false,
        status: 'disabled',
        message: 'Mercado Pago no configurado',
      };
    }

    const token = mp.accessToken.trim();

    try {
      const url = `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(
        externalReference,
      )}&sort=date_created&criteria=desc`;

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data || !Array.isArray(data.results)) {
        return {
          isPaid: false,
          status: 'pending',
        };
      }

      const approvedPayment = data.results.find(
        (p: any) => p.status === 'approved',
      );

      if (approvedPayment) {
        return {
          isPaid: true,
          status: 'approved',
          paymentId: String(approvedPayment.id),
          paymentMethodId: approvedPayment.payment_method_id,
          amount: approvedPayment.transaction_amount,
          dateApproved: approvedPayment.date_approved,
        };
      }

      const lastPayment = data.results[0];
      return {
        isPaid: false,
        status: lastPayment ? lastPayment.status : 'pending',
      };
    } catch (err: unknown) {
      this.logger.warn(
        `No se pudo verificar estado de pago Mercado Pago (${externalReference}): ${
          err instanceof Error ? err.message : err
        }`,
      );
      return {
        isPaid: false,
        status: 'pending',
      };
    }
  }
}
