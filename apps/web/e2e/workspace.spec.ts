import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { E2E_SEED_PASSWORD } from './backend-env.ts';
import { findProjectInList } from './project-list';

/** Proyecto ficticio creado por la seed (apps/backend/src/cli/seed-database.ts). */
const SEED_PROJECT_TITLE = 'Proyecto demo de semillero';

async function signInAs(page: Page, email: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(E2E_SEED_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/panel/);
}

/** Ningún indicador de carga debe quedar colgado (defectos #2 y #3 del relevo). */
async function expectNoPendingLoaders(page: Page): Promise<void> {
  await expect(page.getByRole('status').filter({ hasText: /cargando/i })).toHaveCount(0, { timeout: 10_000 });
}

test.describe('Recorrido real del espacio de trabajo', () => {
  test('el tutor ve el proyecto sembrado, sus tableros y participantes', async ({ page }) => {
    await signInAs(page, 'tutor@example.test');
    await page.goto('/panel#academic');

    const seedProject = await findProjectInList(page, SEED_PROJECT_TITLE);
    await expect(seedProject).toBeVisible();
    await expectNoPendingLoaders(page);

    await seedProject.click();
    await expect(page.getByText('Tatiana Tutora Demo').first()).toBeVisible();
    await expectNoPendingLoaders(page);
  });

  test('novedades y preferencias cargan bajo StrictMode', async ({ page }) => {
    await signInAs(page, 'estudiante@example.test');

    await page.goto('/panel#announcements');
    await expect(page.getByText(/novedades visibles|no hay novedades visibles/i).first()).toBeVisible();
    await expectNoPendingLoaders(page);

    await page.goto('/panel#preferences');
    await expect(page.getByText('Preferencias de notificación').first()).toBeVisible();
    await expectNoPendingLoaders(page);
    await expect(page.getByRole('button', { name: /guardar/i }).first()).toBeVisible();
  });

  test('reuniones muestran la cuenta de Microsoft sin vincular', async ({ page }) => {
    await signInAs(page, 'tutor@example.test');
    await page.goto('/panel#meetings');

    await expect(page.getByText('Cuenta de Microsoft').first()).toBeVisible();
    await expectNoPendingLoaders(page);
    await expect(page.getByRole('button', { name: /vincular/i }).first()).toBeVisible();
  });
});
