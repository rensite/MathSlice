import { test, expect } from '@playwright/test';
import { openPoints, selectVertices, closeSheet, openMenuAction, checkAnswer, openSettings, chooseCourseLesson, answerLesson } from './helpers.js';
import { LESSONS } from '../src/lessons.js';

test('phone opens directly into a full-screen model with compact HUD', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  const stage = await page.getByTestId('stage').boundingBox();
  expect(stage.x).toBe(0);
  expect(stage.y).toBe(0);
  expect(stage.width).toBe(390);
  expect(stage.height).toBe(844);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(844);
  await expect(page.locator('#workspace-title')).toBeHidden();
  await expect(page.locator('#vertex-buttons')).toBeHidden();
  await expect(page.locator('.site-header')).toBeHidden();
  await expect(page.getByTestId('hud-menu')).toBeVisible();
  await expect(page.getByTestId('hud-task')).toBeVisible();
  await expect(page.getByTestId('hud-points')).toBeVisible();
  await expect(page.getByTestId('hud-check')).toBeDisabled();
  await page.getByTestId('hud-task').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('#workspace-title')).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть панель', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.locator('#workspace-title')).toBeHidden();
});

test('phone can solve from model labels without opening the point panel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  for (const id of ['A', 'B', 'C₁']) {
    await page.getByRole('button', { name: `Выбрать вершину ${id} на модели`, exact: true }).click();
  }
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByTestId('hud-check')).toBeEnabled();
  await expect(page.locator('#hud-selection')).toHaveText('A · B · C₁');
  await page.screenshot({ path: 'releases/sechenie-hud-section.png' });
  await page.getByTestId('hud-check').click();
  await expect(page.getByRole('status')).toContainText('Плоскость найдена');
  await expect(page.getByRole('status')).toBeFocused();
  await page.getByTestId('next-lesson').click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.locator('#hud-task-title')).toHaveText(`Задание 2 / ${LESSONS.length}`);
  await expect(page.getByTestId('hud-task')).toBeFocused();
});

test('selection limit is visible in HUD and section metrics remain in the point panel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await selectVertices(page, ['A', 'B', 'C1']);
  await page.getByRole('button', { name: 'Выбрать вершину D на модели', exact: true }).click();
  await expect(page.locator('#hud-notice')).toContainText('Уберите одну из трёх точек');
  await openPoints(page);
  await expect(page.locator('#slice-info')).toBeVisible();
  await expect(page.locator('#slice-info')).toContainText('S =');
  await page.getByTestId('vertex-A').click();
  await closeSheet(page);
  await expect(page.locator('#hud-notice')).toBeHidden();
});

test('sheets trap focus, dismiss with Escape or backdrop, and restore controls on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await openPoints(page);
  await page.getByTestId('vertex-A').click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByTestId('hud-points')).toBeFocused();
  await openSettings(page);
  await page.getByRole('checkbox', { name: 'Сетка', exact: true }).uncheck();
  await page.screenshot({ path: 'releases/sechenie-hud-settings.png' });
  await page.keyboard.press('Tab');
  expect(await page.locator('#mobile-sheet').evaluate(node => node.contains(document.activeElement))).toBe(true);
  await page.mouse.click(2, 2);
  await expect(page.getByRole('dialog')).toBeHidden();
  await openPoints(page);
  await page.setViewportSize({ width: 1440, height: 960 });
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByTestId('vertex-A')).toBeVisible();
  await expect(page.locator('#workspace-title')).toBeFocused();
  await expect(page.getByTestId('vertex-A')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#vertex-buttons')).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#vertex-buttons')).toBeHidden();
  await expect(page.locator('#hud-selection')).toHaveText('A');
});

test('all lessons remain available through mobile menus without revealing answers', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  for (const [index, lesson] of LESSONS.entries()) {
    await openMenuAction(page, 'library');
    await chooseCourseLesson(page, lesson);
    await answerLesson(page, lesson);
    await checkAnswer(page);
    await expect(page.locator('.feedback.success')).toBeVisible();
    await expect(page.locator('#hud-progress')).toHaveText(`${index + 1} / ${LESSONS.length}`);
  }
  await openMenuAction(page, 'progress');
  await expect(page.locator('.progress-summary > strong')).toHaveText(`${LESSONS.length} / ${LESSONS.length}`);
  await closeSheet(page);
  await page.reload();
  await openMenuAction(page, 'progress');
  await expect(page.locator('.progress-summary > strong')).toHaveText(`${LESSONS.length} / ${LESSONS.length}`);
});

test('touch landscape keeps canvas and HUD within the visual viewport', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByTestId('hud-menu')).toBeVisible();
  expect(await page.getByTestId('stage').boundingBox()).toEqual({ x: 0, y: 0, width: 844, height: 390 });
  for (const id of ['hud-menu', 'hud-task', 'hud-points', 'hud-check']) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(844);
    expect(box.y + box.height).toBeLessThanOrEqual(390);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await openPoints(page);
  await page.screenshot({ path: 'releases/sechenie-hud-landscape.png' });
  await selectVertices(page, ['A', 'B', 'C1']);
  await checkAnswer(page);
  await expect(page.getByRole('status')).toContainText('Плоскость найдена');
  await context.close();
});

test('touch drag rotates the full-screen model without selecting a vertex', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto('/');
  const label = page.getByRole('button', { name: 'Выбрать вершину A на модели', exact: true });
  const before = await label.boundingBox();
  const session = await context.newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 160, y: 230 }] });
  for (let step = 1; step <= 8; step++) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 160 + step * 14, y: 230 + step * 7 }] });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const after = await label.boundingBox();
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(20);
  await expect(page.locator('#hud-selection')).toHaveText('0 / 3');
  // A synthetic immediate post-drag touch tap is suppressed by Chromium.
  await page.getByRole('button', { name: 'Исходный ракурс модели', exact: true }).click();
  await expect.poll(async () => Math.abs((await label.boundingBox()).x - before.x)).toBeLessThan(2);
  await context.close();
});

test('closing a result with disabled opener focuses a usable HUD control', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await selectVertices(page, ['A', 'B', 'C1']);
  await checkAnswer(page);
  await page.getByTestId('reveal-answer').click();
  await closeSheet(page);
  await expect(page.getByTestId('hud-check')).toBeDisabled();
  await expect(page.getByTestId('hud-task')).toBeFocused();
});

test('HUD exposes the current task and selected vertices to assistive technology', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByTestId('hud-task')).toHaveAccessibleDescription(`Задание 1 / ${LESSONS.length} A · B · C₁`);
  await expect(page.getByTestId('hud-points')).toHaveAccessibleDescription('0 / 3');
  await selectVertices(page, ['A', 'B', 'C1']);
  await expect(page.getByTestId('hud-points')).toHaveAccessibleDescription('A · B · C₁');
});
