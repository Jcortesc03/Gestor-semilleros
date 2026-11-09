/** Configuración de la integración de inscripciones con Google Sheets (demo). */
export interface GoogleSheetsConfig {
  clientEmail: string;
  privateKey: string;
  timeoutMs: number;
}

export interface EnrollmentConfig {
  /** null si no hay credenciales de cuenta de servicio: adaptador desactivado. */
  google: GoogleSheetsConfig | null;
  /** Asignación confiable área real -> IDs de hoja permitidos (servidor). */
  allowlist: Record<string, string[]>;
  /** Secreto HMAC para tokens de vista previa. */
  previewTokenSecret: string;
  /** Intervalo de limpieza automática de rechazadas (ms). */
  cleanupIntervalMs: number;
  /** Máximo de filas leídas de una hoja. */
  maxSheetRows: number;
  /** Máximo de filas exportadas a Excel. */
  exportMaxRows: number;
}
