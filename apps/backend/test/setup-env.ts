import { testDatabaseUrl } from './test-env';

// Entorno controlado para las pruebas e2e: nunca usa la base de desarrollo.
process.env.DATABASE_URL = testDatabaseUrl();
process.env.AUTH_SECRET = 'secreto-de-pruebas-e2e-no-usar-en-produccion';
process.env.AUTH_TRUST_HOST = 'true';
process.env.AUTH_SESSION_MAX_AGE = '3600';
// Credenciales ficticias: solo registran el proveedor, no contactan a Google.
process.env.AUTH_GOOGLE_ID = 'google-client-id-de-pruebas';
process.env.AUTH_GOOGLE_SECRET = 'google-client-secret-de-pruebas';
// Copias de novedades: sin envío automático en segundo plano; las pruebas llaman al despachador.
process.env.NOTIFICATIONS_AUTO_DISPATCH = 'false';
process.env.NOTIFICATIONS_EMAIL_TRANSPORT = 'log';
process.env.NOTIFICATIONS_WHATSAPP_TRANSPORT = 'log';
