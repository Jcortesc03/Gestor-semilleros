import type { Locator, Page } from '@playwright/test';

/**
 * La lista de proyectos está paginada (ADR 0017): un proyecto concreto puede no estar en la
 * primera página. Se localiza con el buscador, como lo haría una persona.
 */
export async function findProjectInList(page: Page, title: string): Promise<Locator> {
  await page.getByRole('searchbox', { name: 'Buscar proyecto por título' }).fill(title);
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  return page.getByRole('main').getByRole('button', { name: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).first();
}
