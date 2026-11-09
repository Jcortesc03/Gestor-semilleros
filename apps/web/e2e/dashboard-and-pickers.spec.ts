import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { E2E_SEED_PASSWORD } from './backend-env.ts';

/** Datos ficticios de la seed (apps/backend/src/cli/seed-database.ts). */
const SEED_AREA = 'Semillero de investigación';
const SEED_FACULTY = 'Facultad de Ingeniería (demo)';
const SEED_PROJECT = 'Proyecto demo de semillero';

async function signInAs(page: Page, email: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(E2E_SEED_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/panel/);
}

async function expectNoPendingLoaders(page: Page): Promise<void> {
  await expect(page.getByRole('status').filter({ hasText: /cargando/i })).toHaveCount(0, { timeout: 10_000 });
}

test.describe('Panel por rol con datos reales', () => {
  test('el administrador ve la visión institucional', async ({ page }) => {
    await signInAs(page, 'admin@example.test');
    await expect(page.getByRole('heading', { name: 'Toda la institución' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Mis proyectos como tutor' })).toHaveCount(0);
    await expectNoPendingLoaders(page);
  });

  test('el encargado de área ve solo su área asignada', async ({ page }) => {
    await signInAs(page, 'encargado.area@example.test');
    const section = page.locator('[data-role="AREA_MANAGER"]');
    await expect(section.getByRole('heading', { name: 'Mis áreas' })).toBeVisible();
    await expect(section.getByText(SEED_AREA).first()).toBeVisible();
    await expect(page.locator('[data-role="ADMIN"]')).toHaveCount(0);
  });

  test('el decano ve su facultad y el proyecto con su avance', async ({ page }) => {
    await signInAs(page, 'decano@example.test');
    const section = page.locator('[data-role="DEAN"]');
    await expect(section.getByRole('heading', { name: 'Mis facultades' })).toBeVisible();
    await expect(section.getByText(SEED_FACULTY).first()).toBeVisible();
    await expect(section.getByText(SEED_PROJECT).first()).toBeVisible();
  });

  test('el tutor ve sus proyectos y el estudiante sus actividades', async ({ page }) => {
    await signInAs(page, 'tutor@example.test');
    await expect(page.locator('[data-role="TUTOR"]').getByText(SEED_PROJECT).first()).toBeVisible();
    await expectNoPendingLoaders(page);

    await page.getByRole('button', { name: /cerrar sesión/i }).first().click();
    await signInAs(page, 'lider@example.test');
    const student = page.locator('[data-role="STUDENT"]');
    await expect(student.getByRole('heading', { name: 'Mis actividades asignadas' })).toBeVisible();
    await expect(student.getByText('Líder del proyecto').first()).toBeVisible();
  });
});

test.describe('Selección sin UUID', () => {
  test('el administrador crea un proyecto con área y facultad del catálogo y añade un participante buscándolo', async ({ page }) => {
    const title = `Proyecto E2E ${Date.now()}`;
    await signInAs(page, 'admin@example.test');
    await page.goto('/panel#academic');
    await expectNoPendingLoaders(page);

    await page.getByLabel('Título del nuevo proyecto').fill(title);
    await page.getByLabel('Área del nuevo proyecto').selectOption({ label: SEED_AREA });
    await page.getByLabel(SEED_FACULTY).check();
    await page.getByRole('button', { name: 'Crear proyecto' }).click();
    await expect(page.getByText(title).first()).toBeVisible();

    await page.getByText(title).first().click();
    const picker = page.getByRole('combobox', { name: /persona a añadir/i });
    await picker.fill('Esteban');
    await page.getByRole('option', { name: /Esteban Estudiante Demo/ }).click();
    await page.getByRole('button', { name: 'Añadir participante' }).click();
    // Regla de negocio del backend, mostrada con su propio texto (mensajes personalizados).
    await expect(page.getByRole('alert').filter({ hasText: 'El estudiante ya participa en otro proyecto activo.' })).toBeVisible();

    await page.getByRole('button', { name: 'Cambiar persona a añadir' }).click();
    await page.getByRole('combobox', { name: 'Rol en el proyecto' }).selectOption({ label: 'Tutor' });
    await page.getByRole('combobox', { name: /persona a añadir/i }).fill('Tatiana');
    await page.getByRole('option', { name: /Tatiana Tutora Demo/ }).click();
    await page.getByRole('button', { name: 'Añadir participante' }).click();
    await expect(page.getByText('No hay participantes activos visibles en este proyecto.')).toHaveCount(0);
    await expect(page.getByText('Tatiana Tutora Demo').first()).toBeVisible();
    await expect(page.getByText(/UUID/i)).toHaveCount(0);
  });

  test('un error de validación del backend se muestra con su texto en español', async ({ page }) => {
    await signInAs(page, 'admin@example.test');
    // Petición inválida a la API real desde la sesión del navegador: el contrato devuelve `errors[]`.
    const response = await page.request.get('/api/users?pageSize=999');
    expect(response.status()).toBe(400);
    const body = await response.json() as { message: string; errors: string[] };
    expect(body.message).toBe('Datos inválidos.');
    expect(body.errors.length).toBeGreaterThan(0);
  });
});
