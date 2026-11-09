import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { E2E_SEED_PASSWORD } from './backend-env.ts';
import { findProjectInList } from './project-list';

const SEED_PROJECT = 'Proyecto demo de semillero';

async function signInAs(page: Page, email: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(E2E_SEED_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/panel/);
}

test.describe('Crear reuniones (ADR 0010 §10)', () => {
  for (const email of ['decano@example.test', 'encargado.area@example.test', 'tutor@example.test']) {
    test(`${email} ve el formulario «Nueva reunión» en Reuniones`, async ({ page }) => {
      await signInAs(page, email);
      await page.getByRole('complementary').getByRole('button', { name: 'Reuniones' }).click();
      await expect(page.getByRole('heading', { name: 'Nueva reunión' })).toBeVisible();
    });
  }

  test('el estudiante no ve el formulario', async ({ page }) => {
    await signInAs(page, 'estudiante@example.test');
    await page.getByRole('complementary').getByRole('button', { name: 'Reuniones' }).click();
    await expect(page.getByRole('heading', { name: 'Cuenta de Microsoft' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Nueva reunión' })).toHaveCount(0);
  });

  test('desde el proyecto, «Nueva reunión» abre Reuniones con el proyecto preseleccionado', async ({ page }) => {
    await signInAs(page, 'decano@example.test');
    await page.getByRole('complementary').getByRole('button', { name: 'Proyectos y actividades' }).click();
    await (await findProjectInList(page, SEED_PROJECT)).click();
    await page.getByRole('button', { name: 'Nueva reunión' }).first().click();

    await expect(page.getByRole('heading', { name: 'Nueva reunión' })).toBeVisible();
    const project = page.locator('#meeting-project');
    await expect(project.locator('option:checked')).toHaveText(SEED_PROJECT);
  });

  test('desde Mi panel, «Nueva reunión» lleva al formulario', async ({ page }) => {
    await signInAs(page, 'encargado.area@example.test');
    await page.getByRole('main').getByRole('button', { name: 'Nueva reunión' }).first().click();
    await expect(page.getByRole('heading', { name: 'Nueva reunión' })).toBeVisible();
  });
});
