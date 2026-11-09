import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { E2E_SEED_PASSWORD } from './backend-env.ts';

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: /cerrar sesión/i }).first().click();
  await expect(page).toHaveURL(/\/login/);
}

test('contraseña temporal: el administrador la fija, el usuario debe cambiarla y luego se desactiva su cuenta', async ({ page }) => {
  const stamp = Date.now();
  const email = `persona.${stamp}@example.test`;
  const fullName = `Persona E2E ${stamp}`;
  const temporary = `Temporal-${stamp}`;
  const definitive = `Definitiva-${stamp}`;

  // 1. El administrador crea la cuenta (API) y le fija una contraseña temporal desde la interfaz.
  await signIn(page, 'admin@example.test', E2E_SEED_PASSWORD);
  await expect(page).toHaveURL(/\/panel/);
  const created = await page.request.post('/api/users', {
    data: { email, fullName, roles: ['STUDENT'], password: `Inicial-${stamp}` },
  });
  expect(created.status()).toBe(201);

  await page.goto('/panel#users');
  await page.getByLabel('Buscar por nombre o correo').fill(email);
  await page.getByRole('list', { name: 'Usuarios' }).getByRole('button', { name: new RegExp(fullName) }).click();
  await page.getByLabel('Nueva contraseña temporal').fill(temporary);
  await page.getByRole('button', { name: 'Fijar contraseña temporal' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Contraseña temporal fijada' })).toBeVisible();
  await signOut(page);

  // 2. El usuario entra con la temporal y queda bloqueado en el cambio obligatorio.
  await signIn(page, email, temporary);
  await expect(page.getByRole('heading', { name: 'Cambia tu contraseña' })).toBeVisible();
  const blocked = await page.request.get('/api/projects');
  expect(blocked.status()).toBe(403);
  expect((await blocked.json() as { code: string }).code).toBe('PASSWORD_CHANGE_REQUIRED');

  await page.getByLabel('Contraseña actual', { exact: true }).fill(temporary);
  await page.getByLabel('Nueva contraseña', { exact: true }).fill(definitive);
  await page.getByLabel('Confirmar nueva contraseña', { exact: true }).fill(definitive);
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();
  await expect(page.getByText(`Hola, ${fullName}`)).toBeVisible();
  expect((await page.request.get('/api/projects')).status()).toBe(200);
  await signOut(page);

  // 3. El administrador desactiva la cuenta y el usuario ya no puede entrar.
  await signIn(page, 'admin@example.test', E2E_SEED_PASSWORD);
  await expect(page).toHaveURL(/\/panel/);
  await page.goto('/panel#users');
  await page.getByLabel('Buscar por nombre o correo').fill(email);
  await page.getByRole('list', { name: 'Usuarios' }).getByRole('button', { name: new RegExp(fullName) }).click();
  page.once('dialog', (dialog) => { void dialog.accept(); });
  await page.getByRole('button', { name: 'Desactivar cuenta' }).click();
  await expect(page.getByRole('button', { name: 'Reactivar cuenta' })).toBeVisible();
  await signOut(page);

  await signIn(page, email, definitive);
  await expect(page.getByRole('alert')).toHaveText('El correo o la contraseña no son correctos.');
});
