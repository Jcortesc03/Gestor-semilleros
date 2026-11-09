import { BadRequestException, Catch, HttpStatus, PayloadTooLargeException, type ArgumentsHost, type ExceptionFilter, type HttpException } from '@nestjs/common';
import type { Response } from 'express';

export const TOO_LARGE_MESSAGE = 'El archivo supera el tamaño máximo de 25 MB.';

/** Crea el filtro que traduce los errores de Multer (en inglés) a los mensajes del contrato. */
export function createUploadErrorFilter(badUploadError: string) {
  @Catch(PayloadTooLargeException, BadRequestException)
  class UploadErrorFilter implements ExceptionFilter {
    catch(exception: HttpException, host: ArgumentsHost): void {
      const response = host.switchToHttp().getResponse<Response>();
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (status === HttpStatus.PAYLOAD_TOO_LARGE) {
        response.status(status).json({ message: TOO_LARGE_MESSAGE });
      } else if (typeof body === 'object' && 'errors' in body) {
        response.status(status).json(body);
      } else {
        response.status(status).json({ message: 'Datos inválidos.', errors: [badUploadError] });
      }
    }
  }
  return UploadErrorFilter;
}

/** Multer entrega el nombre en latin1; si en realidad era UTF-8 lo restituye. */
export function decodeFileName(name: string): string {
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('�') ? name : decoded;
}
