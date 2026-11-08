import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { E2E_SEED_PASSWORD } from './backend-env.ts';

/** Proyecto ficticio de la seed (apps/backend/src/cli/seed-database.ts). */
const SEED_PROJECT = 'Proyecto demo de semillero';

/** PDF mínimo válido: la firma `%PDF-` es lo que valida el backend (ADR 0013). */
function pdfBytes(text: string): Buffer {
  return Buffer.from(`%PDF-1.4\n% ${text}\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`);
}

async function signInAs(page: Page, email: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(E2E_SEED_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/panel/);
}

async function openSeedProject(page: Page): Promise<void> {
  await page.getByRole('complementary').getByRole('button', { name: 'Proyectos y actividades' }).click();
  await page.getByText(SEED_PROJECT).first().click();
}

test.describe('Documentos en S3 (RustFS) contra el backend real', () => {
  test('el tutor sube un PDF, se descarga con los mismos bytes y un archivo falso se rechaza', async ({ page }) => {
    const stamp = Date.now();
    const fileName = `avance-${stamp}.pdf`;
    const content = pdfBytes(`informe ${stamp}`);

    await signInAs(page, 'tutor@example.test');
    await openSeedProject(page);

    await page.getByLabel('Archivo a subir').setInputFiles({ name: fileName, mimeType: 'application/pdf', buffer: content });
    await page.getByRole('button', { name: 'Subir documento' }).click();
    const download = page.getByRole('link', { name: `Descargar ${fileName}` });
    await expect(download).toBeVisible();

    // La descarga pasa por el backend (RN-62) y devuelve exactamente lo subido.
    const href = await download.getAttribute('href');
    expect(href).toMatch(/^\/api\/documents\/[0-9a-f-]+\/download$/);
    const response = await page.request.get(href ?? '');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/pdf');
    expect(response.headers()['content-disposition']).toContain(`filename*=UTF-8''${fileName}`);
    expect(Buffer.from(await response.body()).equals(content)).toBe(true);

    // Un archivo con extensión .pdf pero sin firma PDF lo rechaza el backend con su mensaje.
    await page.getByLabel('Archivo a subir').setInputFiles({ name: `falso-${stamp}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from('esto no es un pdf') });
    await page.getByRole('button', { name: 'Subir documento' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'El contenido del archivo no corresponde a su tipo.' })).toBeVisible();
    await expect(page.getByRole('link', { name: `Descargar falso-${stamp}.pdf` })).toHaveCount(0);

    // Limpieza: el tutor puede eliminarlo (borrado lógico).
    page.once('dialog', (dialog) => { void dialog.accept(); });
    await page.getByRole('button', { name: `Eliminar ${fileName}` }).click();
    await expect(page.getByRole('link', { name: `Descargar ${fileName}` })).toHaveCount(0);
  });

  test('un usuario ajeno al proyecto no puede descargar sus documentos', async ({ page }) => {
    await signInAs(page, 'tutor@example.test');
    const projects = await (await page.request.get('/api/projects')).json() as { id: string; title: string }[];
    const project = projects.find((item) => item.title === SEED_PROJECT);
    if (!project) throw new Error('No se encontró el proyecto sembrado.');
    const upload = await page.request.post(`/api/projects/${project.id}/documents`, {
      multipart: { file: { name: `privado-${Date.now()}.pdf`, mimeType: 'application/pdf', buffer: pdfBytes('privado') } },
    });
    expect(upload.status()).toBe(201);
    const { id } = await upload.json() as { id: string };
    await page.getByRole('button', { name: /cerrar sesión/i }).first().click();
    await expect(page).toHaveURL(/\/login/);

    // El encargado de área ve los proyectos de su área; el decano, los de su facultad.
    // El administrador lo ve todo. Un usuario sin relación con el proyecto recibe 404.
    await signInAs(page, 'admin@example.test');
    const stranger = `ajeno.${Date.now()}@example.test`;
    expect((await page.request.post('/api/users', { data: { email: stranger, fullName: 'Persona Ajena', roles: ['TUTOR'], password: 'Ajena-Clave-2026' } })).status()).toBe(201);
    await page.getByRole('button', { name: /cerrar sesión/i }).first().click();

    await page.goto('/');
    await page.getByLabel('Correo electrónico').fill(stranger);
    await page.getByLabel('Contraseña', { exact: true }).fill('Ajena-Clave-2026');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page).toHaveURL(/\/panel/);
    expect((await page.request.get(`/api/documents/${id}/download`)).status()).toBe(404);
  });
});
