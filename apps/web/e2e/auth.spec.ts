import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { E2E_SEED_PASSWORD } from './backend-env.ts';

/** Usuarios ficticios de la seed de desarrollo (apps/backend/src/cli/seed-database.ts). */
const TUTOR = { email: 'tutor@example.test', fullName: 'Tatiana Tutora Demo' };
const ADMIN = { email: 'admin@example.test', fullName: 'Alejandra Administradora' };

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

test.describe('Inicio de sesión con correo y contraseña', () => {
  test('entra al panel, mantiene la sesión al recargar y la cierra', async ({ page }) => {
    await signIn(page, TUTOR.email, E2E_SEED_PASSWORD);

    await expect(page).toHaveURL(/\/panel/);
    await expect(page.getByText(TUTOR.fullName).first()).toBeVisible();

    await page.reload();
    await expect(page.getByText(TUTOR.fullName).first()).toBeVisible();

    await page.getByRole('button', { name: /cerrar sesión/i }).first().click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();

    const me = await page.request.get('/api/me');
    expect(me.status()).toBe(401);
  });

  test('rechaza una contraseña incorrecta sin revelar si la cuenta existe', async ({ page }) => {
    await signIn(page, TUTOR.email, 'contrasena-equivocada');

    await expect(page.getByRole('alert')).toHaveText('El correo o la contraseña no son correctos.');
    await expect(page).not.toHaveURL(/\/panel/);
    await expect(page.getByLabel('Contraseña', { exact: true })).toHaveValue('');
  });

  test('una cuenta inexistente recibe el mismo mensaje', async ({ page }) => {
    await signIn(page, 'nadie@example.test', E2E_SEED_PASSWORD);
    await expect(page.getByRole('alert')).toHaveText('El correo o la contraseña no son correctos.');
  });

  test('el administrador ve las secciones de administración', async ({ page }) => {
    await signIn(page, ADMIN.email, E2E_SEED_PASSWORD);
    await expect(page.getByText(ADMIN.fullName).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /crear usuarios/i }).or(page.getByRole('button', { name: /crear usuarios/i })).first()).toBeVisible();
  });
});

test.describe('Inicio de sesión con Google', () => {
  test('el botón envía el formulario de Auth.js y redirige a Google', async ({ page }) => {
    // No se contacta a Google: se ejecuta la petición real a Auth.js sin seguir su 302
    // y se sirve una página local en lugar de la pantalla de consentimiento.
    const captured: { url?: URL; method?: string; body?: string | null } = {};
    await page.route('**/api/auth/signin/google', async (route) => {
      captured.method = route.request().method();
      captured.body = route.request().postData();
      const response = await route.fetch({ maxRedirects: 0 });
      const location = response.headers().location;
      if (location) captured.url = new URL(location);
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<p>Google (simulado)</p>' });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Continuar con Google' }).click();
    await expect(page.getByText('Google (simulado)')).toBeVisible();

    expect(captured.method).toBe('POST');
    expect(new URLSearchParams(captured.body ?? '').get('csrfToken')).toBeTruthy();
    const url = captured.url;
    if (!url) throw new Error('No hubo redirección a Google.');
    expect(url.host).toBe('accounts.google.com');
    expect(url.searchParams.get('client_id')).toBe('google-client-id-e2e');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:5173/api/auth/callback/google');
    expect(url.searchParams.get('scope')).toContain('email');
  });

  test('muestra un mensaje claro si Auth.js devuelve AccessDenied', async ({ page }) => {
    await page.goto('/login?error=AccessDenied');
    await expect(page.getByRole('alert')).toContainText('No hay una cuenta activa registrada con ese correo de Google');
    await expect(page).toHaveURL(/\/login$/);
  });
});
