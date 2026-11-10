import { Injectable, Logger } from '@nestjs/common';
import { AFIP_URLS } from '../afip.constants';

export interface AfipServerStatus {
  appServer: string;
  dbServer: string;
  authServer: string;
  latencyMs: number;
  isAllOk: boolean;
}

@Injectable()
export class AfipWsfeService {
  private readonly logger = new Logger(AfipWsfeService.name);

  /**
   * Ejecuta el método FEDummy en el Web Service de Facturación Electrónica de AFIP (WSFEv1).
   * Comprueba el estado de salud de AppServer, DbServer y AuthServer.
   */
  async checkDummy(isProduction: boolean, timeoutMs = 6000): Promise<AfipServerStatus> {
    const wsUrl = isProduction ? AFIP_URLS.WSFE_PROD : AFIP_URLS.WSFE_HOMO;
    const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <FEDummy xmlns="http://ar.gov.afip.dif.FEV1/" />
  </soap:Body>
</soap:Envelope>`;

    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(wsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: 'http://ar.gov.afip.dif.FEV1/FEDummy',
          'User-Agent': 'JustiMobile-POS-AFIP/1.0',
        },
        body: soapEnvelope,
        signal: controller.signal,
      });

      const latencyMs = Date.now() - startTime;
      const xmlText = await res.text();

      const appMatch = xmlText.match(/<AppServer>(.*?)<\/AppServer>/i);
      const dbMatch = xmlText.match(/<DbServer>(.*?)<\/DbServer>/i);
      const authMatch = xmlText.match(/<AuthServer>(.*?)<\/AuthServer>/i);

      const appServer = appMatch ? appMatch[1] : 'OK';
      const dbServer = dbMatch ? dbMatch[1] : 'OK';
      const authServer = authMatch ? authMatch[1] : 'OK';
      const isAllOk =
        appServer === 'OK' && dbServer === 'OK' && authServer === 'OK';

      return {
        appServer,
        dbServer,
        authServer,
        latencyMs,
        isAllOk,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
