import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { selectVertices, checkAnswer } from './helpers.js';
import { LESSONS } from '../src/lessons.js';

test('packaged HTML works offline with live WebGL and persistent progress', async ({ browser }) => {
  execFileSync('python3', ['scripts/release.py'], { cwd: resolve('.') });
  const context = await browser.newContext({ offline: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  await page.goto(pathToFileURL(resolve('releases/sechenie-mvp.html')).href);
  const canvas = page.getByTestId('stage').locator('canvas');
  await expect(canvas).toBeVisible();
  expect(await canvas.evaluate(canvas => {
    const gl = canvas.getContext('webgl2');
    return !!gl && !gl.isContextLost() && gl.drawingBufferWidth > 100;
  })).toBe(true);
  await selectVertices(page, ['A', 'B', 'C1']);
  await checkAnswer(page);
  await expect(page.getByTestId('progress-count')).toHaveText(`1 / ${LESSONS.length}`);
  await page.reload();
  await expect(page.getByTestId('progress-count')).toHaveText(`1 / ${LESSONS.length}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
  await context.close();
});
