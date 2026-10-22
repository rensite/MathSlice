import { test, expect } from '@playwright/test';
import { LESSONS } from '../src/lessons.js';
import { selectVertices as select, checkAnswer, openMenuAction, openSettings, openPoints, closeSheet, chooseCourseLesson, answerLesson } from './helpers.js';

async function openApp(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByTestId('stage').locator('canvas')).toBeVisible();
  return errors;
}
test('real 3D canvas renders with no runtime errors', async ({ page }) => {
  const errors = await openApp(page);
  const hasGL = await page.getByTestId('stage').locator('canvas').evaluate((canvas) => {
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    return !!gl && !gl.isContextLost() && gl.drawingBufferWidth > 100;
  });
  expect(hasGL).toBe(true);
  await expect(page.getByTestId('check-answer')).toBeDisabled();
  await page.screenshot({ path: 'releases/sechenie-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('correct cube plane earns progress and persists after reload', async ({ page }) => {
  const errors = await openApp(page);
  await select(page, ['A', 'B', 'C1']);
  await expect(page.getByTestId('check-answer')).toBeEnabled();
  await page.getByTestId('check-answer').click();
  await expect(page.getByTestId('progress-count')).toContainText('1');
  await page.reload();
  await expect(page.getByTestId('progress-count')).toContainText('1');
  expect(errors).toEqual([]);
});

test('revealed answer does not earn progress', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('reveal-answer').click();
  await expect(page.getByTestId('progress-count')).toContainText('0');
  if (await page.getByTestId('check-answer').isEnabled()) {
    await page.getByTestId('check-answer').click();
    await expect(page.getByTestId('progress-count')).toContainText('0');
  }
  await page.reload();
  await expect(page.getByTestId('progress-count')).toContainText('0');
  await select(page, ['A', 'B', 'C1']);
  await expect(page.getByTestId('check-answer')).toBeDisabled();
});

test('all course lessons can be completed through the browser', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = await openApp(page);
  for (const [index, lesson] of LESSONS.entries()) {
    await page.locator('[data-action="library"]').click();
    await chooseCourseLesson(page, lesson);
    await answerLesson(page, lesson);
    await page.getByTestId('check-answer').click();
    await expect(page.locator('.feedback.success')).toBeVisible();
    await expect(page.getByTestId('progress-count')).toHaveText(`${index + 1} / ${LESSONS.length}`);
  }
  await page.reload();
  await expect(page.getByTestId('progress-count')).toHaveText(`${LESSONS.length} / ${LESSONS.length}`);
  expect(errors).toEqual([]);
});

test('wrong plane is rejected and another triple on correct plane is accepted', async ({ page }) => {
  await openApp(page);
  await select(page, ['A', 'B', 'C']);
  await page.getByTestId('check-answer').click();
  await expect(page.getByRole('status')).toContainText('Это другая плоскость');
  await expect(page.getByTestId('progress-count')).toHaveText(`0 / ${LESSONS.length}`);
  await page.getByTestId('reset-selection').click();
  await select(page, ['D1', 'A', 'C1']);
  await page.getByTestId('check-answer').click();
  await expect(page.getByTestId('progress-count')).toHaveText(`1 / ${LESSONS.length}`);
});

test('controls rotate model, change visibility, show hints, and reset view', async ({ page }) => {
  await openApp(page);
  const vertex = page.getByRole('button', { name: 'Выбрать вершину A на модели', exact: true });
  const before = await vertex.boundingBox();
  const canvas = page.getByTestId('stage').locator('canvas');
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.6, { steps: 8 });
  await page.mouse.up();
  const after = await vertex.boundingBox();
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(10);
  await page.getByRole('button', { name: 'Вернуть исходный ракурс' }).click();
  await expect.poll(async () => Math.abs((await vertex.boundingBox()).x - before.x)).toBeLessThan(2);
  await page.getByText('Настройки чертежа', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'Обозначения' }).uncheck();
  await expect(vertex).toBeHidden();
  await page.getByRole('checkbox', { name: 'Обозначения' }).check();
  await expect(vertex).toBeVisible();
  await page.getByTestId('show-hint').click();
  await expect(page.getByText('Небольшая подсказка', { exact: true })).toBeVisible();
  await expect(page.getByTestId('progress-count')).toHaveText(`0 / ${LESSONS.length}`);
});

test('mobile lab switches between all solids without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await openApp(page);
  await openMenuAction(page, 'lab');
  await openSettings(page);
  for (const shape of ['prism', 'pyramid', 'cube']) {
    await page.getByTestId(`choose-shape-${shape}`).click();
    await expect(page.getByTestId('stage').locator('canvas')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow, shape).toBe(false);
  }
  await select(page, ['A', 'B', 'C1']);
  await openPoints(page);
  await page.getByTestId('reset-selection').click();
  await closeSheet(page);
  expect(errors).toEqual([]);
});

test('phone panels expose large point controls and return to the model', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  await expect(page.locator('#workspace-title')).toBeHidden();
  const check = await page.getByTestId('hud-check').boundingBox();
  expect(check.y + check.height).toBeLessThanOrEqual(844);
  await openPoints(page);
  const point = await page.getByTestId('vertex-A').boundingBox();
  expect(point.width).toBeGreaterThanOrEqual(44);
  expect(point.height).toBeGreaterThanOrEqual(44);
  await openMenuAction(page, 'library');
  await expect(page.getByRole('dialog')).toBeVisible();
  await chooseCourseLesson(page, LESSONS[2]);
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByTestId('stage')).toBeVisible();
  await page.getByTestId('hud-task').click();
  await expect(page.locator('#workspace-title')).toHaveText(LESSONS[2].title);
});

for (const viewport of [{ width: 320, height: 568 }, { width: 360, height: 740 }, { width: 430, height: 932 }, { width: 844, height: 390 }]) {
  test(`layout fits ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openApp(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await select(page, LESSONS[0].target);
    await checkAnswer(page);
    await expect(page.getByRole('status')).toContainText('Плоскость найдена');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('touch phone can complete a lesson and navigate to the next one', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await openApp(page);
  await page.screenshot({ path: 'releases/sechenie-mobile.png', fullPage: true });
  await page.screenshot({ path: 'releases/sechenie-phone-viewport.png' });
  await openPoints(page);
  for (const id of LESSONS[0].target) await page.getByTestId(`vertex-${id}`).tap();
  await closeSheet(page);
  await page.getByTestId('hud-check').tap();
  await expect(page.getByRole('status')).toContainText('Плоскость найдена');
  await page.getByTestId('next-lesson').tap();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.locator('#hud-task-title')).toHaveText(`Задание 2 / ${LESSONS.length}`);
  await expect(page.getByTestId('hud-task')).toBeInViewport();
  await context.close();
});

test('storage unavailable leaves the trainer usable', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('storage disabled'); } }); });
  await openApp(page);
  await select(page, LESSONS[0].target);
  await page.getByTestId('check-answer').click();
  await expect(page.getByRole('status')).toContainText('Плоскость найдена');
  await expect(page.locator('.storage-note')).toContainText('Сохранение недоступно');
});

test('rail rerenders keep keyboard focus on the action or its result', async ({ page }) => {
  await openApp(page);
  const hint = page.getByTestId('show-hint');
  await hint.focus();
  await page.keyboard.press('Enter');
  await expect(hint).toBeFocused();
  await select(page, LESSONS[0].target);
  await page.getByTestId('check-answer').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toBeFocused();
});

test('WebGL failure has an accessible fallback and working answer controls', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type.startsWith('webgl') ? null : original.call(this, type, ...args);
    };
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('3D-модель недоступна');
  await select(page, LESSONS[0].target);
  await page.getByTestId('check-answer').click();
  await expect(page.getByRole('status')).toContainText('Плоскость найдена');
  expect(errors).toEqual([]);
});

test('losing a live WebGL context removes stale model controls', async ({ page }) => {
  const errors = await openApp(page);
  await page.locator('canvas').evaluate(canvas => canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await expect(page.getByRole('alert')).toContainText('Связь с 3D-моделью прервана');
  await expect(page.locator('#vertex-overlay')).toBeHidden();
  await expect(page.locator('.orbit-help')).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await select(page, LESSONS[0].target);
  await checkAnswer(page);
  await expect(page.getByTestId('progress-count')).toHaveText(`1 / ${LESSONS.length}`);
  expect(errors).toEqual([]);
});
