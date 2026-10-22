import { test, expect } from '@playwright/test';
import { openMenuAction, openSettings, closeSheet, selectVertices, checkAnswer, chooseCourseLesson, openPoints } from './helpers.js';
import { SHAPES } from '../src/geometry.js';
import { LESSONS } from '../src/lessons.js';
import { STORAGE_KEY } from '../src/progress.js';

test('course library groups every lesson into six themes and exposes difficulty filters', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await openMenuAction(page, 'library');
  await expect(page.locator('.course-module')).toHaveCount(6);
  await expect(page.locator('[data-action="filter-level"]')).toHaveCount(4);
  await expect(page.locator('[data-action="continue-course"]')).toBeVisible();
  await expect(page.locator('.course-overview')).toContainText(String(LESSONS.length));
  await expect(page.locator('[data-action="lesson"]')).toHaveCount(LESSONS.length);
});

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
test(`all six solids fit the ${viewport.width}px mobile model viewport and remain selectable in the lab`, async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize(viewport);
  await page.goto('/');
  await openMenuAction(page, 'lab');
  for (const shapeId of Object.keys(SHAPES)) {
    await openSettings(page);
    await page.getByTestId(`choose-shape-${shapeId}`).click();
    await closeSheet(page);
    const labels = page.locator('#vertex-overlay .vertex-label');
    await expect(labels).toHaveCount(SHAPES[shapeId].vertices.length);
    for (const label of await labels.all()) {
      const box = await label.boundingBox();
      expect(box.x, `${shapeId} left`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${shapeId} right`).toBeLessThanOrEqual(viewport.width);
      expect(box.y, `${shapeId} top`).toBeGreaterThanOrEqual(70);
      expect(box.y + box.height, `${shapeId} bottom`).toBeLessThanOrEqual(viewport.height - 84);
    }
    await selectVertices(page, LESSONS.find(lesson => lesson.shapeId === shapeId).target);
    await expect(page.getByTestId('hud-check')).toBeHidden();
    if (shapeId === 'hexprism') {
      await openPoints(page);
      await expect(page.locator('#slice-info')).toContainText('6 сторон ·');
      await closeSheet(page);
    }
    await page.screenshot({ path: `releases/sechenie-lab-${shapeId}${viewport.width === 390 ? '' : '-320'}.png` });
  }
});
}

test('difficulty filters show the selected level and keep keyboard focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await openMenuAction(page, 'library');
  await page.screenshot({ path: 'releases/sechenie-course.png' });
  const filter = page.locator('[data-action="filter-level"][data-level="challenge"]');
  await filter.focus();
  await page.keyboard.press('Enter');
  await expect(filter).toBeFocused();
  await expect(filter).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-action="lesson"]')).toHaveCount(LESSONS.filter(lesson=>lesson.level==='challenge').length);
  await expect(page.locator('.lesson-list .level-badge:not([data-level="challenge"])')).toHaveCount(0);
  await chooseCourseLesson(page, LESSONS.find(lesson => lesson.id === 'cube-corner'));
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.locator('#hud-selection')).toHaveText('0 / 3');
  await page.getByTestId('hud-task').click();
  await expect(page.locator('#workspace-title')).toHaveText('Три диагонали вместо четырёх сторон');
});

test('continue resumes unstudied work and distinguishes revealed lessons from earned progress', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await selectVertices(page, LESSONS[0].target);
  await checkAnswer(page);
  await openMenuAction(page, 'library');
  await expect(page.locator('.course-continue')).toContainText(LESSONS[1].title);
  await page.locator('[data-action="continue-course"]').click();
  await page.getByTestId('hud-task').click();
  await page.getByTestId('reveal-answer').click();
  await closeSheet(page);
  await page.reload();
  await openMenuAction(page, 'library');
  await expect(page.locator('.course-continue')).toContainText(LESSONS[2].title);
  await expect(page.locator('[data-course-shape="cube"] > summary')).toContainText(`1 / ${LESSONS.filter(lesson=>lesson.shapeId==='cube').length} решено`);
  await expect(page.locator('[data-course-shape="cube"] > summary')).toContainText('1 разобрано');
  await openMenuAction(page, 'progress');
  await expect(page.locator('.progress-summary > strong')).toHaveText(`1 / ${LESSONS.length}`);
  await expect(page.locator('.course-progress-facts')).toContainText(`Изучено 2 / ${LESSONS.length}`);
  await expect(page.locator('.course-progress-facts')).toContainText('Разобрано без зачёта 1');
  await page.screenshot({ path: 'releases/sechenie-course-progress.png' });
});

test('legacy six-lesson saves retain all earned progress in the expanded course', async ({ page }) => {
  const originalIds = ['cube-diagonal','cube-vertical','prism-diagonal','prism-face','pyramid-ac','pyramid-bd'];
  await page.addInitScript(({key,ids}) => localStorage.setItem(key,JSON.stringify({version:1,solved:ids,hints:[]})), {key:STORAGE_KEY,ids:originalIds});
  await page.goto('/');
  await expect(page.getByTestId('progress-count')).toHaveText(`6 / ${LESSONS.length}`);
  await openMenuAction(page, 'library');
  for (const shape of ['cube','prism','pyramid']) await expect(page.locator(`[data-course-shape="${shape}"] > summary`)).toContainText(`2 / ${LESSONS.filter(lesson=>lesson.shapeId===shape).length} решено`);
  await expect(page.locator('.course-continue')).toContainText(LESSONS[1].title);
});

test('studying every revealed answer does not masquerade as thirty independent solves', async ({ page }) => {
  await page.addInitScript(({key,ids}) => localStorage.setItem(key,JSON.stringify({version:1,solved:[],hints:[],revealed:ids})), {key:STORAGE_KEY,ids:LESSONS.map(lesson=>lesson.id)});
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await openMenuAction(page, 'library');
  await expect(page.locator('[data-action="continue-course"]')).toHaveCount(0);
  await expect(page.locator('.course-finished')).toContainText('не засчитываются');
  await openMenuAction(page, 'progress');
  await expect(page.locator('.progress-summary > strong')).toHaveText(`0 / ${LESSONS.length}`);
  await expect(page.locator('.course-progress-facts')).toContainText(`Изучено ${LESSONS.length} / ${LESSONS.length}`);
});

test('revealing an already solved lesson preserves its earned completion without a contradictory notice', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await selectVertices(page, LESSONS[0].target);
  await checkAnswer(page);
  await page.getByTestId('reveal-answer').click();
  await expect(page.locator('.feedback.revealed')).toContainText('Самостоятельное решение уже засчитано и сохранено');
  await expect(page.locator('.feedback.revealed')).not.toContainText('Задание не засчитывается');
  await page.reload();
  await page.getByTestId('hud-task').click();
  await expect(page.locator('.feedback.revealed')).toContainText('Самостоятельное решение уже засчитано и сохранено');
  await openMenuAction(page, 'progress');
  await expect(page.locator('.progress-summary > strong')).toHaveText(`1 / ${LESSONS.length}`);
  await expect(page.locator('.course-progress-facts')).toContainText('Разобрано без зачёта 0');
});
