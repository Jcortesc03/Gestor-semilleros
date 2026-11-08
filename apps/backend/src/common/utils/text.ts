/**
 * Forma de comparación para búsquedas: sin tildes ni diacríticos y en minúsculas.
 * Limitación: la eñe se reduce a "n" (NFD separa la tilde), así que "ñ" y "n" coinciden.
 */
export function normalizeForSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase();
}
