export interface PhoneCountry {
  code: string;
  name: string;
  prefix: string;
  lengths: readonly number[];
}

// Fixed-line/mobile national lengths from Google's libphonenumber metadata (2026-11-08).
// https://github.com/google/libphonenumber/blob/master/resources/PhoneNumberMetadata.xml
// Length checks do not prove that a number exists or has WhatsApp.
export const PHONE_COUNTRIES: readonly PhoneCountry[] = [
  { code: 'AR', name: 'Argentina', prefix: '54', lengths: [10, 11] },
  { code: 'BZ', name: 'Belice', prefix: '501', lengths: [7] },
  { code: 'BO', name: 'Bolivia', prefix: '591', lengths: [8] },
  { code: 'BR', name: 'Brasil', prefix: '55', lengths: [10, 11] },
  { code: 'CL', name: 'Chile', prefix: '56', lengths: [9] },
  { code: 'CO', name: 'Colombia', prefix: '57', lengths: [8, 10] },
  { code: 'CR', name: 'Costa Rica', prefix: '506', lengths: [8] },
  { code: 'CU', name: 'Cuba', prefix: '53', lengths: [6, 7, 8, 10] },
  { code: 'EC', name: 'Ecuador', prefix: '593', lengths: [8, 9] },
  { code: 'SV', name: 'El Salvador', prefix: '503', lengths: [8] },
  { code: 'GT', name: 'Guatemala', prefix: '502', lengths: [8] },
  { code: 'GY', name: 'Guyana', prefix: '592', lengths: [7] },
  { code: 'HT', name: 'Haití', prefix: '509', lengths: [8] },
  { code: 'HN', name: 'Honduras', prefix: '504', lengths: [8] },
  { code: 'MX', name: 'México', prefix: '52', lengths: [10] },
  { code: 'NI', name: 'Nicaragua', prefix: '505', lengths: [8] },
  { code: 'PA', name: 'Panamá', prefix: '507', lengths: [7, 8] },
  { code: 'PY', name: 'Paraguay', prefix: '595', lengths: [7, 8, 9] },
  { code: 'PE', name: 'Perú', prefix: '51', lengths: [8, 9] },
  { code: 'PR', name: 'Puerto Rico', prefix: '1', lengths: [10] },
  { code: 'DO', name: 'República Dominicana', prefix: '1', lengths: [10] },
  { code: 'SR', name: 'Surinam', prefix: '597', lengths: [6, 7] },
  { code: 'UY', name: 'Uruguay', prefix: '598', lengths: [8] },
  { code: 'VE', name: 'Venezuela', prefix: '58', lengths: [10] },
  { code: 'DE', name: 'Alemania', prefix: '49', lengths: [5, 6, 7, 8, 9, 10, 11, 12, 13] },
  { code: 'AU', name: 'Australia', prefix: '61', lengths: [9] },
  { code: 'CA', name: 'Canadá', prefix: '1', lengths: [10] },
  { code: 'CN', name: 'China', prefix: '86', lengths: [7, 8, 9, 10, 11] },
  { code: 'ES', name: 'España', prefix: '34', lengths: [9] },
  { code: 'US', name: 'Estados Unidos', prefix: '1', lengths: [10] },
  { code: 'FR', name: 'Francia', prefix: '33', lengths: [9] },
  { code: 'IN', name: 'India', prefix: '91', lengths: [10] },
  { code: 'IT', name: 'Italia', prefix: '39', lengths: [6, 7, 8, 9, 10, 11, 12] },
  { code: 'JP', name: 'Japón', prefix: '81', lengths: [9, 10] },
  { code: 'PT', name: 'Portugal', prefix: '351', lengths: [9] },
  { code: 'GB', name: 'Reino Unido', prefix: '44', lengths: [9, 10] },
  { code: 'CH', name: 'Suiza', prefix: '41', lengths: [9] },
];

export function splitPhone(phone: string | null, preferredCode?: string): { countryCode: string; nationalNumber: string } {
  if (!phone) return { countryCode: preferredCode ?? '', nationalNumber: '' };
  const matches = PHONE_COUNTRIES.filter((country) => phone.startsWith(`+${country.prefix}`));
  // A calling code is not a country identifier: preserve the selection for shared +1.
  const country = matches.find((item) => item.code === preferredCode)
    ?? matches.find((item) => item.code === 'US') ?? matches[0];
  return country
    ? { countryCode: country.code, nationalNumber: phone.slice(country.prefix.length + 1) }
    : { countryCode: '', nationalNumber: phone };
}
