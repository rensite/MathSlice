import { test, expect } from '@playwright/test';
import { openMenuAction, closeSheet } from './helpers.js';

async function drag(session, from, delta) {
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, ...from }] });
  for (let step = 1; step <= 12; step++) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: from.x + delta.x * step / 12, y: from.y + delta.y * step / 12 }] });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function assertStationaryPage(page, viewport) {
  expect(await page.evaluate(() => ({ x: scrollX, y: scrollY, vx: visualViewport.offsetLeft, vy: visualViewport.offsetTop }))).toEqual({ x: 0, y: 0, vx: 0, vy: 0 });
  expect(await page.getByTestId('stage').boundingBox()).toEqual({ x: 0, y: 0, ...viewport });
}

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`touch drags starting on vertex labels rotate instead of moving the page at ${viewport.width}px`, async ({ browser }) => {
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
    try {
      const page = await context.newPage();
      await page.goto('/');
      const session = await context.newCDPSession(page);
      const label = page.locator('#vertex-overlay [data-vertex="A"]');
      const reference = page.locator('#vertex-overlay [data-vertex="B"]');
      await page.evaluate(() => { window.cancelledTouches = 0; document.querySelector('#stage').addEventListener('pointercancel', () => window.cancelledTouches++); });
      for (const delta of [{ x: 90, y: 0 }, { x: 0, y: -65 }, { x: 90, y: -65 }]) {
        await page.getByRole('button', { name: 'Исходный ракурс модели', exact: true }).click();
        const start = await label.boundingBox();
        const before = await reference.boundingBox();
        await drag(session, { x: start.x + start.width / 2, y: start.y + start.height / 2 }, delta);
        const after = await reference.boundingBox();
        expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(15);
        expect(await page.evaluate(() => window.cancelledTouches)).toBe(0);
        await expect(page.locator('#hud-selection')).toHaveText('0 / 3');
        await assertStationaryPage(page, viewport);
      }
    } finally { await context.close(); }
  });
}

test('touch scrolling stays available inside the course sheet without moving the model page', async ({ browser }) => {
  const viewport = { width: 390, height: 844 };
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await openMenuAction(page, 'library');
    const content = page.locator('#sheet-content');
    const box = await content.boundingBox();
    const session = await context.newCDPSession(page);
    await drag(session, { x: box.x + box.width / 2, y: box.y + box.height - 40 }, { x: 0, y: -180 });
    await expect.poll(() => content.evaluate(node => node.scrollTop)).toBeGreaterThan(40);
    await assertStationaryPage(page, viewport);
    await closeSheet(page);
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.getByRole('button', { name: 'Выбрать вершину A на модели', exact: true }).tap();
    await expect(page.locator('#hud-selection')).toHaveText('A');
  } finally { await context.close(); }
});

test('cancelled and two-finger gestures never select vertices while taps and keyboard activation remain single', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage();
    await page.goto('/');
    const session = await context.newCDPSession(page);
    const label = page.locator('#vertex-overlay [data-vertex="A"]');
    const box = await label.boundingBox();
    const first = { id: 1, x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect(page.locator('#hud-selection')).toHaveText('0 / 3');
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first, { id: 2, x: first.x + 80, y: first.y }] });
    for (let step = 1; step <= 8; step++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [first, { id: 2, x: first.x + 80 + step * 8, y: first.y }] });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [first] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('#hud-selection')).toHaveText('0 / 3');
    await page.getByRole('button', { name: 'Исходный ракурс модели', exact: true }).click();
    await label.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#hud-selection')).toHaveText('A');
    const second = page.locator('#vertex-overlay [data-vertex="B"]');
    await second.tap();
    await expect(page.locator('#hud-selection')).toHaveText('A · B');
    await second.tap();
    await expect(page.locator('#hud-selection')).toHaveText('A');
  } finally { await context.close(); }
});
