import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { E2E_SEED_PASSWORD } from './backend-env.ts';

/** Datos ficticios de la seed (apps/backend/src/cli/seed-database.ts). */
const SEED_AREA = 'Semillero de investigación';
const SEED_PROJECT = 'Proyecto demo de semillero';

async function signInAs(page: Page, email: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(E2E_SEED_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/panel/);
}

async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: /cerrar sesión/i }).first().click();
  await expect(page).toHaveURL(/\/login/);
}

/** Navega con el menú lateral, como lo haría una persona. */
async function openSection(page: Page, label: string): Promise<void> {
  await page.getByRole('complementary').getByRole('button', { name: label }).click();
  await expect(page.getByRole('heading', { level: 1, name: label })).toBeVisible();
}

test.describe('Reglas del ADR 0010 contra el backend real', () => {
  test('el administrador crea y elimina un área desde «Áreas y facultades»', async ({ page }) => {
    const name = `Área E2E ${Date.now()}`;
    await signInAs(page, 'admin@example.test');
    await page.goto('/panel#institution');

    await page.getByLabel('Nombre del área').fill(name);
    await page.getByRole('button', { name: 'Crear área' }).click();
    await expect(page.getByText(name).first()).toBeVisible();

    await page.getByRole('button', { name: `Eliminar ${name}` }).click();
    await page.getByRole('group', { name: 'Confirmación' }).getByRole('button', { name: /eliminar/i }).click();
    await expect(page.getByText(name)).toHaveCount(0);
  });

  test('el encargado de área ve los proyectos de su área y publica solo para su área', async ({ page }) => {
    await signInAs(page, 'encargado.area@example.test');

    await page.goto('/panel#academic');
    await expect(page.getByText(SEED_PROJECT).first()).toBeVisible();

    await page.goto('/panel#announcements');
    await page.getByRole('button', { name: 'Nueva novedad' }).click();
    const audience = page.getByLabel('Destinatarios');
    await expect(audience.locator('option', { hasText: 'Todos los usuarios' })).toHaveCount(0);

    const title = `Aviso de área ${Date.now()}`;
    await page.getByLabel('Título').fill(title);
    await page.getByLabel('Contenido').fill('Reunión general del semillero.');
    await page.getByLabel('Área destinataria').selectOption({ label: SEED_AREA });
    await page.getByRole('button', { name: 'Publicar novedad' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Novedad publicada' })).toBeVisible();
  });

  test('el tutor publica una novedad para su proyecto', async ({ page }) => {
    await signInAs(page, 'tutor@example.test');
    await page.goto('/panel#announcements');
    await page.getByRole('button', { name: 'Nueva novedad' }).click();

    const title = `Aviso del tutor ${Date.now()}`;
    await page.getByLabel('Título').fill(title);
    await page.getByLabel('Contenido').fill('Entrega del avance el viernes.');
    await page.getByLabel('Proyecto destinatario').selectOption({ label: SEED_PROJECT });
    await page.getByRole('button', { name: 'Publicar novedad' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Novedad publicada' })).toBeVisible();
  });

  test('el administrador y el encargado de área publican por roles', async ({ page }) => {
    for (const email of ['admin@example.test', 'encargado.area@example.test']) {
      await signInAs(page, email);
      await page.goto('/panel#announcements');
      await page.getByRole('button', { name: 'Nueva novedad' }).click();
      await page.getByLabel('Título').fill(`Aviso por roles ${Date.now()}`);
      await page.getByLabel('Contenido').fill('Convocatoria para tutores.');
      await page.getByLabel('Destinatarios').selectOption({ label: 'Por roles' });
      await page.getByRole('group', { name: 'Roles destinatarios' }).getByLabel('Tutor').check();
      await page.getByRole('button', { name: 'Publicar novedad' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Novedad publicada' })).toBeVisible();
      await page.getByRole('button', { name: /cerrar sesión/i }).first().click();
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test('cada cargo solo ve sus áreas y facultades en la web', async ({ page }) => {
    // El administrador crea un área y una facultad ajenas al encargado y al decano sembrados.
    const stamp = Date.now();
    await signInAs(page, 'admin@example.test');
    const area = await (await page.request.post('/api/areas', { data: { name: `Área ajena ${stamp}` } })).json() as { id: string; name: string };
    const faculty = await (await page.request.post('/api/faculties', { data: { name: `Facultad ajena ${stamp}` } })).json() as { id: string; name: string };
    await signOut(page);

    try {
      await signInAs(page, 'encargado.area@example.test');
      await openSection(page, 'Proyectos y actividades');
      const areaSelect = page.getByLabel('Área del nuevo proyecto');
      await expect(areaSelect.locator('option', { hasText: SEED_AREA })).toHaveCount(1);
      await expect(areaSelect.locator('option', { hasText: area.name })).toHaveCount(0);
      await openSection(page, 'Áreas y facultades');
      await expect(page.getByText(SEED_AREA).first()).toBeVisible();
      await expect(page.getByText(area.name)).toHaveCount(0);
      await signOut(page);

      await signInAs(page, 'decano@example.test');
      await openSection(page, 'Proyectos y actividades');
      const faculties = page.getByRole('group', { name: 'Facultades del nuevo proyecto' });
      await expect(faculties.getByLabel('Facultad de Ingeniería (demo)')).toBeVisible();
      await expect(faculties.getByLabel(faculty.name)).toHaveCount(0);
      await signOut(page);
    } finally {
      // Limpieza con la sesión del administrador (la misma página, sin un segundo contexto).
      await page.context().clearCookies();
      await signInAs(page, 'admin@example.test');
      await page.request.delete(`/api/areas/${area.id}`);
      await page.request.delete(`/api/faculties/${faculty.id}`);
    }
  });
});
