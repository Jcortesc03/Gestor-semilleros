import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { E2E_SEED_PASSWORD } from './backend-env.ts';

const WIDTHS = [390, 768, 1440] as const;

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const width of WIDTHS) {
  test(`sin scroll horizontal en login y panel a ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });

    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.screenshot({ path: testInfo.outputPath(`login-${width}.png`), fullPage: true });

    await page.getByLabel('Correo electrónico').fill('admin@example.test');
    await page.getByLabel('Contraseña', { exact: true }).fill(E2E_SEED_PASSWORD);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page).toHaveURL(/\/panel/);
    await expect(page.getByText('Hola, Alejandra Administradora')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.screenshot({ path: testInfo.outputPath(`panel-${width}.png`), fullPage: true });
  });
}
