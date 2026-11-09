import { randomBytes } from 'crypto';

export interface SalePricingResult {
  subtotalCents: number;
  discountPercentageApplied: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
}

/**
 * Calculadora de dominio pura (aritmética entera en centavos).
 * Evita errores de punto flotante y centraliza el cálculo entre previewSale y createSale.
 */
export function calculateSaleTotals(params: {
  subtotalCents: number;
  rawTaxCents: number;
  discountPercentageApplied: number;
}): SalePricingResult {
  const { subtotalCents, rawTaxCents, discountPercentageApplied } = params;

  const discountCents = Math.round(
    (subtotalCents * discountPercentageApplied) / 100,
  );
  const taxableAfterDiscountRatio =
    subtotalCents > 0 ? (subtotalCents - discountCents) / subtotalCents : 1;
  const taxCents = Math.round(rawTaxCents * taxableAfterDiscountRatio);
  const totalCents = Math.max(0, subtotalCents - discountCents + taxCents);

  return {
    subtotalCents,
    discountPercentageApplied,
    discountCents,
    taxCents,
    totalCents,
  };
}

/**
 * Generador determinístico de folios POS legibles (ej. POS-20261109-A1B2C3).
 */
export function generateReceiptNumber(now: Date = new Date()): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const rand = randomBytes(3).toString('hex').toUpperCase();
  return `POS-${yyyy}${mm}${dd}-${rand}`;
}
