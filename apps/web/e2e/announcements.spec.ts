import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { E2E_SEED_PASSWORD } from './backend-env.ts';

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

test.describe('Novedades por tipo y noticias con adjuntos (ADR 0015) contra el backend real y RustFS', () => {
  test('el administrador publica una noticia con un PDF; aparece en «Noticias» y se descarga intacto', async ({ page }) => {
    const stamp = Date.now();
    const title = `Convocatoria ${stamp}`;
    const fileName = `bases-${stamp}.pdf`;
    const content = pdfBytes(`bases ${stamp}`);

    await signInAs(page, 'admin@example.test');
    await page.getByRole('complementary').getByRole('button', { name: 'Novedades' }).click();
    await page.getByRole('button', { name: 'Nueva novedad' }).click();

    await page.getByLabel('Título').fill(title);
    await page.getByLabel('Contenido').fill('Consulta las bases adjuntas.');
    await page.getByLabel('Tipo', { exact: true }).selectOption({ label: 'Noticia' });
    await page.getByLabel('Archivos adjuntos (opcional)').setInputFiles({ name: fileName, mimeType: 'application/pdf', buffer: content });
    await expect(page.getByRole('list', { name: 'Archivos elegidos' }).getByText(fileName)).toBeVisible();
    await page.getByRole('button', { name: 'Publicar novedad' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Novedad publicada' })).toBeVisible();

    // Pestaña «Noticias»: la noticia aparece con su adjunto.
    const tabs = page.getByRole('tablist', { name: 'Tipo de novedad' });
    await tabs.getByRole('tab', { name: 'Noticias' }).click();
    await expect(tabs.getByRole('tab', { name: 'Noticias' })).toHaveAttribute('aria-selected', 'true');
    const download = page.getByRole('link', { name: `Descargar ${fileName}` });
    await expect(download).toBeVisible();

    const href = await download.getAttribute('href');
    const response = await page.request.get(href ?? '');
    expect(response.status()).toBe(200);
    expect(Buffer.from(await response.body()).equals(content)).toBe(true);

    // Pestaña «Comunicados»: la noticia no aparece.
    await tabs.getByRole('tab', { name: 'Comunicados' }).click();
    await expect(page.getByRole('heading', { name: title })).toHaveCount(0);
  });
});
