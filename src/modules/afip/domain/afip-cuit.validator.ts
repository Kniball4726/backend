/**
 * Validador de Dominio para CUIT / CUIL (República Argentina)
 * Implementa el algoritmo oficial Módulo 11 con ponderadores [5, 4, 3, 2, 7, 6, 5, 4, 3, 2].
 */

export function cleanCuit(rawCuit: string | null | undefined): string {
  if (!rawCuit) return '';
  return rawCuit.replace(/\D/g, '');
}

export function formatCuit(rawCuit: string | null | undefined): string {
  const clean = cleanCuit(rawCuit);
  if (clean.length !== 11) return rawCuit?.trim() || '';
  return `${clean.slice(0, 2)}-${clean.slice(2, 10)}-${clean.slice(10)}`;
}

export function validateCuit(rawCuit: string | null | undefined): boolean {
  const clean = cleanCuit(rawCuit);
  if (clean.length !== 11) return false;

  const validPrefixes = ['20', '23', '24', '27', '30', '33', '34'];
  const prefix = clean.slice(0, 2);
  if (!validPrefixes.includes(prefix)) {
    return false;
  }

  const multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += Number(clean[i]) * multipliers[i];
  }

  const remainder = 11 - (sum % 11);
  let expectedDigit = remainder;
  if (remainder === 11) expectedDigit = 0;
  if (remainder === 10) expectedDigit = 9;

  return expectedDigit === Number(clean[10]);
}
