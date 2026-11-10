/**
 * Constantes y definiciones normativas de los Servicios Web de AFIP / ARCA
 * (Administración Federal de Ingresos Públicos / Agencia de Recaudación y Control Aduanero)
 */

export const AFIP_URLS = {
  WSFE_HOMO: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
  WSFE_PROD: 'https://servicios1.afip.gob.ar/wsfev1/service.asmx',
  WSAA_HOMO: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
  WSAA_PROD: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
  QR_VERIFY_BASE: 'https://www.afip.gob.ar/fe/qr/?p=',
} as const;

export const AFIP_CBTE_TIPO = {
  FACTURA_A: 1,
  NOTA_DEBITO_A: 2,
  NOTA_CREDITO_A: 3,
  FACTURA_B: 6,
  NOTA_DEBITO_B: 7,
  NOTA_CREDITO_B: 8,
  FACTURA_C: 11,
  NOTA_DEBITO_C: 12,
  NOTA_CREDITO_C: 13,
} as const;

export const AFIP_DOC_TIPO = {
  CUIT: 80,
  CUIL: 86,
  CDI: 87,
  DNI: 96,
  PASAPORTE: 94,
  CONSUMIDOR_FINAL: 99,
} as const;

export const AFIP_CONCEPTO = {
  PRODUCTOS: 1,
  SERVICIOS: 2,
  PRODUCTOS_Y_SERVICIOS: 3,
} as const;

export const AFIP_MONEDA = {
  PESOS_ARGENTINOS: 'PES',
  DOLAR_ESTADOUNIDENSE: 'DOL',
} as const;
