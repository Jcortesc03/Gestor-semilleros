export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  /** `true` si el administrador fijó una contraseña temporal y debe cambiarla (ADR 0011). */
  mustChangePassword: boolean;
}

export interface Credentials {
  email: string;
  password: string;
}
