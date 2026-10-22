import { test, expect } from '@playwright/test';
import { openSettings, openPoints, closeSheet, selectVertices, openMenuAction } from './helpers.js';
import { EXTRA_SHAPES } from '../src/extra-shapes.js';
import { SURFACES } from '../src/surfaces.js';
import { LESSONS } from '../src/lessons.js';
import { renderExtraCatalog } from '../src/catalog-view.js';

async function more(page,includeHiddenSurfaces=false) {
  await openSettings(page);
  const details = page.locator('#more-shapes');
  // Test-only opt-in to retained controls; real users have no such switch.
  if (includeHiddenSurfaces) await details.evaluate((node,html)=>{
    const template=document.createElement('template');
    template.innerHTML=html;
    node.querySelector('.more-shape-content').innerHTML=template.content.querySelector('.more-shape-content').innerHTML;
  },renderExtraCatalog(EXTRA_SHAPES,SURFACES,{showSurfaces:true}));
  if (!await details.evaluate(node=>node.open)) await details.locator('summary').click();
}

test('extra school figures stay behind show more and are explorable without changing course progress', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await openSettings(page);
  await expect(page.getByTestId('choose-shape-cube')).toBeVisible();
  await expect(page.getByTestId('choose-shape-tetrahedron')).toBeHidden();
  await expect(page.locator('#more-shapes > summary')).toContainText('Показать ещё');
  await page.locator('#more-shapes > summary').click();
  await expect(page.getByTestId('choose-shape-tetrahedron')).toBeVisible();
  await expect(page.locator('#more-shapes')).not.toContainText('Университет');
  await expect(page.locator('#more-shapes')).not.toContainText('Тела вращения');
  await expect(page.locator('[data-action="surface"]')).toHaveCount(0);
  await page.getByTestId('choose-shape-tetrahedron').click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.locator('#hud-task-title')).toHaveText('Лаборатория');
  await expect(page.locator('#vertex-overlay .vertex-label')).toHaveCount(4);
  await expect(page.getByTestId('hud-check')).toBeHidden();
  await expect(page.getByTestId('progress-count')).toHaveText(`0 / ${LESSONS.length}`);
  await selectVertices(page,['A','B','C']);
  await openPoints(page);
  await expect(page.locator('#slice-info')).toContainText('3 стороны');
});

test('retained round-solid controls work with a test-only catalog opt-in and restore point training', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await more(page,true);
  await page.getByTestId('choose-surface-cylinder').click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.locator('#hud-task-detail')).toContainText('Цилиндр');
  await expect(page.locator('#vertex-overlay .vertex-label')).toHaveCount(0);
  await expect(page.getByTestId('hud-undo')).toBeHidden();
  await expect(page.locator('#surface-controls')).toBeHidden();
  await openPoints(page);
  await expect(page.locator('#surface-controls')).toBeVisible();
  await expect(page.locator('.construction')).toBeHidden();
  await page.screenshot({path:'releases/sechenie-catalog-plane-controls.png'});
  await expect(page.locator('#slice-info')).toContainText('S ≈');
  await page.getByLabel('Наклон плоскости',{exact:true}).focus();
  await page.keyboard.press('End');
  await expect(page.locator('#slice-info')).toContainText('S ≈ 4');
  await page.getByLabel('Смещение плоскости',{exact:true}).focus();
  await page.keyboard.press('End');
  await expect(page.locator('#slice-info')).toContainText('Нет пересечения');
  await closeSheet(page);
  await openMenuAction(page,'training');
  await expect(page.locator('#hud-task-title')).toHaveText(`Задание 1 / ${LESSONS.length}`);
  await expect(page.locator('#vertex-overlay .vertex-label')).toHaveCount(8);
  await selectVertices(page,['A','B','C1']);
  await expect(page.getByTestId('hud-check')).toBeEnabled();
});

test('every extra polyhedron fits a small phone and supports genuine vertex-plane sections', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({width:320,height:568});
  const errors = [];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  for (const [id,shape] of Object.entries(EXTRA_SHAPES)) {
    await more(page);
    await page.getByTestId(`choose-shape-${id}`).click();
    const labels = page.locator('#vertex-overlay .vertex-label');
    await expect(labels).toHaveCount(shape.vertices.length);
    for (const label of await labels.all()) {
      const box = await label.boundingBox();
      expect(box.x,`${id} left`).toBeGreaterThanOrEqual(0);
      expect(box.x+box.width,`${id} right`).toBeLessThanOrEqual(320);
      expect(box.y,`${id} top`).toBeGreaterThanOrEqual(65);
      expect(box.y+box.height,`${id} bottom`).toBeLessThanOrEqual(490);
    }
    await selectVertices(page,shape.faces[0].slice(0,3));
    await openPoints(page);
    await expect(page.locator('#slice-info')).toContainText('S =');
    await closeSheet(page);
    await page.screenshot({path:`releases/sechenie-catalog-${id}.png`});
  }
  expect(errors).toEqual([]);
});

test('retained smooth models have honest metrics with a test-only catalog opt-in', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({width:390,height:844});
  const errors = [];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  for (const [id,definition] of Object.entries(SURFACES)) {
    await more(page,true);
    await page.getByTestId(`choose-surface-${id}`).click();
    await expect(page.locator('#hud-points-title')).toHaveText('Плоскость');
    await openPoints(page);
    await expect(page.locator('#slice-info')).not.toContainText('Нет пересечения');
    await expect(page.locator('#slice-info')).not.toContainText('Касание');
    if (definition.closed) await expect(page.locator('#slice-info')).toContainText('S ≈');
    else {
      await expect(page.locator('#slice-info')).not.toContainText('S');
      await expect(page.locator('#surface-approximation')).toContainText('фрагмент');
    }
    expect(await page.locator('#sheet-content').evaluate(node=>node.scrollWidth-node.clientWidth)).toBe(0);
    await closeSheet(page);
    await page.screenshot({path:`releases/sechenie-catalog-${id}.png`});
  }
  expect(errors).toEqual([]);
});

test('desktop school-only catalog is bounded and responsive point controls restore without duplicates', async ({ page }) => {
  await page.goto('/');
  const stage = await page.getByTestId('stage').boundingBox();
  await page.locator('#more-shapes > summary').click();
  await expect(page.locator('[data-action="surface"]')).toHaveCount(0);
  await expect(page.locator('#more-shapes')).not.toContainText('Университет');
  await expect(page.locator('#more-shapes')).not.toContainText('Тела вращения');
  expect(await page.getByTestId('stage').boundingBox()).toEqual(stage);
  const popup = await page.locator('.more-shape-content').boundingBox();
  expect(popup.x).toBeGreaterThanOrEqual(0);
  expect(popup.x+popup.width).toBeLessThanOrEqual(1440);
  expect(popup.y+popup.height).toBeLessThanOrEqual(944);
  await page.setViewportSize({width:1000,height:600});
  await expect.poll(async()=>{const box=await page.locator('.more-shape-content').boundingBox();return box.y+box.height;}).toBeLessThanOrEqual(584);
  await page.setViewportSize({width:1440,height:960});
  await page.screenshot({path:'releases/sechenie-catalog-desktop.png'});
  await page.getByTestId('choose-shape-tetrahedron').click();
  await expect(page.locator('.construction')).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  await openPoints(page);
  await page.getByTestId('vertex-A').click();
  await page.setViewportSize({width:1440,height:960});
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.locator('.construction')).toHaveCount(1);
  await expect(page.locator('.construction')).toBeVisible();
  await expect(page.getByTestId('vertex-A')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#surface-controls')).toBeHidden();
});

test('retained surface controls work without WebGL with a test-only catalog opt-in', async({page})=>{
  await page.setViewportSize({width:320,height:568});
  await page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(kind,...args){return /^webgl/.test(kind) ? null : original.call(this,kind,...args);};
  });
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('3D-модель недоступна');
  await more(page,true);
  await page.getByTestId('choose-surface-cylinder').click();
  await openPoints(page);
  await expect(page.locator('#slice-info')).toContainText('S ≈ 3,13');
  await page.locator('[data-plane-preset="vertical"]').click();
  await expect(page.locator('#slice-info')).toHaveText('S ≈ 4');
  await closeSheet(page);
  await openMenuAction(page,'training');
  await selectVertices(page,LESSONS[0].target);
  await page.getByTestId('hud-check').click();
  await expect(page.getByRole('status')).toContainText('Плоскость найдена');
  expect(errors).toEqual([]);
});
