import { test, expect } from '@playwright/test';
import { openMenuAction, openPoints, closeSheet, selectVertices, chooseCourseLesson, checkAnswer } from './helpers.js';
import { LESSONS } from '../src/lessons.js';

async function edgePoint(page, edge, fraction = 'half', percent) {
  await openPoints(page);
  const tools = page.locator('#edge-tools');
  if (!await tools.evaluate(node => node.open)) await tools.locator('summary').click();
  await page.getByLabel('Ребро', { exact: true }).selectOption(edge);
  if (percent !== undefined) await page.getByLabel('Положение от первой вершины, %', { exact: true }).fill(String(percent));
  else await page.locator(`[data-action="edge-fraction"][data-fraction="${fraction}"]`).click();
  await page.getByTestId('add-edge-point').click();
}

test('mobile lab constructs a true section through three edge midpoints without cluttering the model', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await openMenuAction(page, 'lab');
  await edgePoint(page, 'A:B');
  await edgePoint(page, 'A:A1');
  await edgePoint(page, 'A:D');
  await expect(page.locator('#slice-info')).toHaveText('3 стороны · S = 0,87');
  await expect(page.locator('#edge-selected [data-vertex]')).toHaveCount(3);
  await closeSheet(page);
  await expect(page.locator('#vertex-overlay .edge-label')).toHaveCount(3);
  await expect(page.locator('#hud-selection')).toContainText('AB·½');
  await expect(page.getByTestId('hud-check')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: 'releases/sechenie-edge-midpoints.png' });
});

test('thirds and custom percentages remain distinct from midpoints and support removal and undo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await openMenuAction(page, 'lab');
  await edgePoint(page, 'A:B', 'third');
  await expect(page.locator('#edge-selected')).toContainText('AB·⅓');
  await edgePoint(page, 'A:B', 'half', 37);
  await expect(page.locator('#edge-selected')).toContainText('AB·37%');
  await edgePoint(page, 'A:A1', 'two-thirds');
  await expect(page.locator('#edge-selected')).toContainText('AA₁·⅔');
  await page.locator('#edge-selected [data-vertex]').first().click();
  await expect(page.locator('#edge-selected [data-vertex]')).toHaveCount(2);
  await expect(page.locator('#edge-selected [data-vertex]').first()).toBeFocused();
  await closeSheet(page);
  await page.getByTestId('hud-undo').click();
  await expect(page.locator('#hud-selection')).toHaveText('AB·37%');
});

test('edge lessons earn persistent progress but revealing their answers never does', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const lesson = LESSONS.find(item=>item.id==='cube-edge-midpoints');
  await openMenuAction(page,'library');
  await chooseCourseLesson(page,lesson);
  await selectVertices(page,lesson.target);
  await checkAnswer(page);
  await expect(page.getByRole('status')).toContainText('Плоскость найдена');
  await page.reload();
  await expect(page.getByTestId('progress-count')).toHaveText(`1 / ${LESSONS.length}`);
  await openMenuAction(page,'library');
  await chooseCourseLesson(page,LESSONS.find(item=>item.id==='pyramid-edge-thirds'));
  await page.getByTestId('hud-task').click();
  await page.getByTestId('reveal-answer').click();
  await closeSheet(page);
  await expect(page.locator('#vertex-overlay .edge-label')).toHaveCount(3);
  await page.reload();
  await expect(page.getByTestId('progress-count')).toHaveText(`1 / ${LESSONS.length}`);
  await openMenuAction(page,'library');
  await chooseCourseLesson(page,LESSONS.find(item=>item.id==='pyramid-edge-thirds'));
  await selectVertices(page,LESSONS.find(item=>item.id==='pyramid-edge-thirds').target);
  await expect(page.getByTestId('hud-check')).toBeDisabled();
});

test('invalid edge percentages cannot be added and a precise fractional percentage keeps its label', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await openPoints(page);
  await page.locator('#edge-tools summary').click();
  const input = page.getByLabel('Положение от первой вершины, %',{exact:true});
  for (const value of ['0','100','']) {
    await input.fill(value);
    await expect(page.getByTestId('add-edge-point')).toBeDisabled();
  }
  await input.fill('37.5');
  await page.getByTestId('add-edge-point').click();
  await expect(page.locator('#edge-selected')).toContainText('AB·37.5%');
  await expect(page.locator('#sheet-content')).toHaveJSProperty('scrollWidth',await page.locator('#sheet-content').evaluate(node=>node.clientWidth));
  await page.screenshot({path:'releases/sechenie-edge-picker-320.png'});
});

test('edge tasks remain solvable without WebGL while the unavailable model picker is disabled', async ({ page }) => {
  await page.addInitScript(()=>{
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type,...args) { return type.startsWith('webgl') ? null : original.call(this,type,...args); };
  });
  const errors = [];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await openMenuAction(page,'library');
  const lesson = LESSONS.find(item=>item.id==='cube-edge-thirds');
  await chooseCourseLesson(page,lesson);
  await expect(page.locator('[data-action="pick-edge"]')).toBeDisabled();
  await selectVertices(page,lesson.target);
  await checkAnswer(page);
  await expect(page.getByRole('status')).toContainText('Плоскость найдена');
  expect(errors).toEqual([]);
});

test('a model edge can be picked without stealing rotation or choosing a point before confirmation', async ({ browser }) => {
  const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  try {
    const page = await context.newPage();
    await page.goto('/');
    await openMenuAction(page,'lab');
    const positions = await page.locator('#vertex-overlay [data-vertex="A"], #vertex-overlay [data-vertex="B"]').evaluateAll(nodes=>nodes.map(node=>({x:parseFloat(node.style.left),y:parseFloat(node.style.top)})));
    await openPoints(page);
    await page.locator('#edge-tools summary').click();
    await page.locator('[data-action="pick-edge"]').click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.touchscreen.tap((positions[0].x+positions[1].x)/2,(positions[0].y+positions[1].y)/2);
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel('Ребро',{exact:true})).toHaveValue('A:B');
    await expect(page.locator('#hud-selection')).toHaveText('0 / 3');
    await page.locator('[data-fraction="half"]').click();
    await page.getByTestId('add-edge-point').click();
    await closeSheet(page);
    await expect(page.locator('#vertex-overlay .edge-label')).toHaveCount(1);
    const point = await page.locator('#vertex-overlay .edge-label').boundingBox();
    const vertex = page.locator('#vertex-overlay [data-vertex="B"]');
    const before = await vertex.boundingBox();
    const session = await context.newCDPSession(page);
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x+point.width/2,y:point.y+point.height/2}]});
    for (let step=1;step<=8;step++) await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x+point.width/2+step*9,y:point.y+point.height/2-step*3}]});
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    const after = await vertex.boundingBox();
    expect(Math.hypot(after.x-before.x,after.y-before.y)).toBeGreaterThan(15);
    await expect(page.locator('#hud-selection')).toHaveText('AB·½');
    expect(await page.evaluate(()=>({x:scrollX,y:scrollY}))).toEqual({x:0,y:0});
  } finally { await context.close(); }
});
