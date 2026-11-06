import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/** Hash y verificación de contraseñas con Argon2id (parámetros por defecto de la librería). */
@Injectable()
export class PasswordService {
  /** Hash ficticio para igualar tiempos cuando el usuario no existe. */
  private dummyHash: Promise<string> | undefined;

  hash(password: string): Promise<string> {
    return hash(password);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      // Hash corrupto o con formato desconocido: se trata como contraseña incorrecta.
      return false;
    }
  }

  /** Ejecuta una verificación descartable para no revelar si el correo existe. */
  async verifyAgainstDummy(password: string): Promise<void> {
    this.dummyHash ??= hash('dummy-password-for-timing-equalization');
    await this.verify(await this.dummyHash, password);
  }
}
