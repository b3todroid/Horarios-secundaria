import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function waitSaved(page: Page) {
  await expect(page.locator('.save-status')).toHaveClass(/saved/);
}

test.describe.configure({ mode: 'serial' });

test('flujo completo: datos, disponibilidad, generación, consulta y respaldo', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Mi escuela' })).toBeVisible();

  // 1. Crear un maestro
  await page.getByRole('navigation').getByRole('link', { name: 'Maestros', exact: true }).click();
  await page.getByRole('button', { name: '+ Agregar maestro' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo maestro' });
  await dialog.getByLabel('Nombre completo').fill('Laura Gómez Ríos');
  await dialog.getByLabel('Carga semanal (horas)').fill('5');
  await dialog.getByLabel('Máximo de horas consecutivas').fill('2');
  await dialog.getByRole('button', { name: 'Guardar maestro' }).click();
  await expect(page.getByRole('cell', { name: 'Laura Gómez Ríos', exact: true })).toBeVisible();

  // 2. Crear un grupo
  await page.getByRole('navigation').getByRole('link', { name: 'Grupos', exact: true }).click();
  await page.getByRole('button', { name: '+ Agregar grupo' }).click();
  await page.getByRole('dialog').getByLabel('Nombre del grupo').fill('1A');
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar grupo' }).click();
  await expect(page.getByRole('heading', { name: '1.º grado' })).toBeVisible();

  // 3. Crear una materia
  await page.getByRole('navigation').getByRole('link', { name: 'Materias', exact: true }).click();
  await page.getByRole('button', { name: '+ Agregar materia' }).click();
  await page.getByRole('dialog').getByLabel('Nombre de la materia').fill('Matemáticas');
  await page.getByRole('dialog').getByLabel('Abreviatura (opcional)').fill('MAT');
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar materia' }).click();
  await expect(page.getByRole('cell', { name: 'Matemáticas', exact: true })).toBeVisible();

  // 4. Registrar la carga semanal
  await page.getByRole('navigation').getByRole('link', { name: 'Carga horaria', exact: true }).click();
  await page.getByRole('combobox', { name: 'Maestro', exact: true }).selectOption({ label: 'M01 · Laura Gómez Ríos' });
  await page.getByRole('combobox', { name: 'Materia', exact: true }).selectOption({ label: 'Matemáticas' });
  await page.getByRole('combobox', { name: 'Grupo', exact: true }).selectOption({ label: '1A' });
  await page.getByLabel('Horas/semana').fill('5');
  await page.getByRole('button', { name: 'Agregar', exact: true }).click();
  await expect(page.getByText('Asignación agregada.')).toBeVisible();
  const summary = page.getByRole('region', { name: 'Resumen de cargas' });
  await expect(summary.getByText('✓ Completa')).toBeVisible();

  // 5. Configurar disponibilidad: lunes completo bloqueado y martes 1ª flexible
  await page.getByRole('navigation').getByRole('link', { name: 'Disponibilidad', exact: true }).click();
  const brush = page.getByRole('group', { name: 'Al tocar una celda' });
  await brush.getByRole('button', { name: 'Bloqueada', exact: true }).click();
  await page.getByRole('button', { name: /Lunes — aplicar a todo el día/ }).click();
  await expect(page.getByRole('button', { name: /Lunes, hora 3 .*Bloqueada/ })).toBeVisible();
  await brush.getByRole('button', { name: 'Flexible', exact: true }).click();
  await page.getByRole('button', { name: /Martes, hora 1 .*Disponible/ }).click();
  await expect(page.getByRole('button', { name: /Martes, hora 1 .*Flexible/ })).toBeVisible();
  await waitSaved(page);

  // 6. Generar el horario
  await page.getByRole('navigation').getByRole('link', { name: 'Generar horario', exact: true }).click();
  await expect(page.getByText('✓ Sin errores')).toBeVisible();
  // El maestro se creó antes que la materia: el sistema lo advierte sin impedir generar.
  await expect(page.getByText('Laura Gómez Ríos no tiene registrada la materia Matemáticas.')).toBeVisible();
  await page.getByRole('button', { name: 'Generar horario', exact: true }).click();
  await expect(page.getByText('Horario completo: 5 clases colocadas.').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.stat', { hasText: 'Horas flexibles usadas' }).locator('.value')).toHaveText('0');

  // 7. Consultar el resultado por maestro y por grupo
  await page.getByRole('navigation').getByRole('link', { name: 'Resultados', exact: true }).click();
  await page.getByRole('tab', { name: 'Por grupo' }).click();
  const groupTable = page.getByRole('table', { name: 'Horario del grupo 1A' });
  await expect(groupTable.locator('.lesson')).toHaveCount(5);
  await page.getByRole('tab', { name: 'Por maestro' }).click();
  const teacherTable = page.getByRole('table', { name: 'Horario de Laura Gómez Ríos' });
  await expect(teacherTable.locator('.lesson')).toHaveCount(5);
  // El lunes está bloqueado: ninguna clase ese día
  await expect(teacherTable.locator('.lesson').filter({ hasText: 'Lunes' })).toHaveCount(0);
  const mondayCells = teacherTable.locator('tbody tr td:nth-child(2) .lesson');
  await expect(mondayCells).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /Conflictos/ })).toContainText('0');

  // 8. Exportar un respaldo
  await page.getByRole('navigation').getByRole('link', { name: 'Respaldos', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar respaldo' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^respaldo-Mi-escuela-.*\.json$/);
  const backup = JSON.parse(readFileSync(await download.path(), 'utf-8'));
  expect(backup.format).toBe('horarios-secundaria');
  expect(backup.teachers[0].name).toBe('Laura Gómez Ríos');
  expect(backup.schedule).toHaveLength(5);
});

test('edición manual: mover una clase con vista previa y deshacer', async ({ page }) => {
  await page.goto('/resultados');
  await page.getByLabel('Modo edición').check();
  await page.getByRole('tab', { name: 'Por grupo' }).click();
  const table = page.getByRole('table', { name: 'Horario del grupo 1A' });
  await table.locator('.lesson').first().click();
  await expect(page.getByText(/Seleccionada:/)).toBeVisible();
  // Mover a un espacio vacío del viernes
  await table.getByRole('button', { name: /Espacio vacío: Viernes/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Confirmar cambio' });
  await expect(dialog.getByText('Clase original')).toBeVisible();
  await expect(dialog.getByText('Nueva posición')).toBeVisible();
  await expect(dialog.getByText('Maestros involucrados')).toBeVisible();
  await expect(dialog.getByText('Grupos involucrados')).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirmar cambio' }).click();
  await expect(page.getByText('Cambio guardado.')).toBeVisible();
  await page.getByRole('button', { name: /Deshacer/ }).click();
  await expect(page.getByText(/Se deshizo:/)).toBeVisible();
});

test('demostración con conflicto explica qué falta', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir ejemplo con conflicto' }).click();
  await expect(page.getByText('Proyecto de DEMOSTRACIÓN', { exact: false })).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: 'Generar horario', exact: true }).click();
  await expect(page.getByText('Disponibilidad insuficiente').first()).toBeVisible();
  await page.getByRole('button', { name: 'Generar horario', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Reporte de conflictos' })).toBeVisible({ timeout: 40_000 });
  const report = page.getByRole('region', { name: 'Resultado de la generación' });
  await expect(report.getByText('Jorge Méndez Ortiz').first()).toBeVisible();
  await expect(report.getByText('Posibles soluciones:').first()).toBeVisible();
  await expect(report.getByText(/Horas faltantes/).first()).toBeVisible();
});

test('importar fotografía con revisión antes de guardar', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Proyecto' }).selectOption({ label: 'Mi escuela' });
  await page.getByRole('navigation').getByRole('link', { name: 'Importar fotografía', exact: true }).click();
  // PNG de 1x1 píxel
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  await page.getByTestId('file-input').setInputFiles({ name: 'formato.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByRole('heading', { name: '2. Recorta o gira la imagen' })).toBeVisible();
  await page.getByRole('button', { name: '↻ Girar a la derecha' }).click();
  await page.getByRole('button', { name: /Procesar 1 página/ }).click();
  await expect(page.getByRole('heading', { name: 'Revisar datos reconocidos' })).toBeVisible();
  await expect(page.getByRole('img', { name: /Página 1/ })).toBeVisible();
  await expect(page.getByText('! Revisar').first()).toBeVisible();
  await page.getByLabel(/Nombre del maestro/).fill('Rosa Núñez Vega');
  await page.getByRole('button', { name: 'Confirmar e importar' }).click();
  await expect(page.getByText(/Importación completa/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Carga horaria' })).toBeVisible();
  await expect(page.getByRole('cell', { name: /Rosa Núñez Vega/ }).first()).toBeVisible();
});

test('navegación en celular @celular', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir menú' }).click();
  await page.getByRole('navigation').getByRole('link', { name: 'Disponibilidad', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Disponibilidad semanal' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
