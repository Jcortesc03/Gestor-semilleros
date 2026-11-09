/** Abstracción de lectura de una hoja de cálculo (Google Sheets). */
export interface SheetProvider {
  read(spreadsheetId: string, range: string): Promise<string[][]>;
}

export const SHEET_PROVIDER = Symbol('SHEET_PROVIDER');
