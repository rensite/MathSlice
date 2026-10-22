import { test, expect } from '@playwright/test';
import { selectVertices, openPoints, closeSheet } from './helpers.js';

// Decode a real browser screenshot, not a readback of a potentially cleared GL buffer.
async function exteriorTintPixels(page) {
  const canvas = page.locator('#canvas-host canvas');
  const bounds = await page.locator('#vertex-overlay').evaluate(overlay => {
    const points = [...overlay.children].map(button => {
      const r = button.getBoundingClientRect();
      return { x: r.x + r.width / 2 - 15, y: r.y + r.height / 2 + 15 };
    });
    return { minX: Math.min(...points.map(p => p.x)), maxX: Math.max(...points.map(p => p.x)), minY: Math.min(...points.map(p => p.y)), maxY: Math.max(...points.map(p => p.y)) };
  });
  const screenshot = await canvas.screenshot();
  return page.evaluate(async ({ png, bounds }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const surface = document.createElement('canvas');
    surface.width = image.width; surface.height = image.height;
    const context = surface.getContext('2d');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, surface.width, surface.height).data;
    let count = 0;
    for (let y = 80; y < surface.height - 90; y++) for (let x = 0; x < surface.width; x++) {
      if (x >= bounds.minX - 28 && x <= bounds.maxX + 28 && y >= bounds.minY - 28 && y <= bounds.maxY + 28) continue;
      const i = (y * surface.width + x) * 4;
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      if (r > g && g > b + 2 && r > b + 8 && r < b + 45) count++;
    }
    return count;
  }, { png: screenshot.toString('base64'), bounds });
}

test('face-coincident plane continues transparently outside the cube without changing its section', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await selectVertices(page, ['A', 'B', 'C']);
  expect(await exteriorTintPixels(page)).toBeGreaterThan(150);
  await page.screenshot({ path: 'releases/sechenie-plane-face.png' });
  await openPoints(page);
  await expect(page.locator('#slice-info')).toHaveText('4 стороны · S = 4');
  await page.getByTestId('reset-selection').click();
  await closeSheet(page);
  expect(await exteriorTintPixels(page)).toBe(0);
});
