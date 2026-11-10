import { AFIP_URLS } from '../afip.constants';

/**
 * Parámetros normativos para generar el código QR de AFIP
 * Conforme a la RG AFIP 4291/2018 y sus modificatorias.
 */
export interface AfipQrParams {
  cuit: string;
  cbteTipo: number;
  ptoVta: number;
  cbteNro: number;
  importeCents: number;
  fecha: Date;
  docTipo: number;
  docNro: string;
  cae: string;
}

export function generateAfipQrPayload(params: AfipQrParams): Record<string, unknown> {
  const fechaStr = params.fecha.toISOString().split('T')[0]; // YYYY-MM-DD
  const importePesos = Number((params.importeCents / 100).toFixed(2));
  const cleanCuitNum = Number(params.cuit.replace(/\D/g, '')) || 0;
  const cleanDocNum = Number(params.docNro.replace(/\D/g, '')) || 0;
  const caeNum = Number(params.cae.replace(/\D/g, '')) || 0;

  return {
    ver: 1,
    fecha: fechaStr,
    cuit: cleanCuitNum,
    ptoVta: params.ptoVta,
    tipoCmp: params.cbteTipo,
    nroCmp: params.cbteNro,
    importe: importePesos,
    moneda: 'PES',
    ctz: 1,
    tipoDocRec: params.docTipo,
    nroDocRec: cleanDocNum,
    tipoCodAut: 'E', // E = CAE (Código de Autorización Electrónico)
    codAut: caeNum,
  };
}

export function generateAfipQrUrl(params: AfipQrParams): string {
  const payload = generateAfipQrPayload(params);
  const jsonStr = JSON.stringify(payload);
  const base64Data = Buffer.from(jsonStr).toString('base64');
  return `${AFIP_URLS.QR_VERIFY_BASE}${base64Data}`;
}
