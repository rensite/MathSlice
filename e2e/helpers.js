export async function hasHud(page) {
  return page.getByTestId('hud-menu').isVisible();
}
export async function closeSheet(page) {
  if (await page.getByRole('dialog').isVisible()) {
    await page.getByRole('button', { name: 'Закрыть панель', exact: true }).click();
  }
}
export async function openPoints(page) {
  if (await hasHud(page)) {
    await closeSheet(page);
    await page.getByTestId('hud-points').click();
  }
}
export async function selectVertices(page, ids) {
  await openPoints(page);
  for (const id of ids) {
    if (!id.startsWith('edge:')) { await page.getByTestId(`vertex-${id}`).click(); continue; }
    const [,from,to,fraction] = id.split(':');
    const tools = page.locator('#edge-tools');
    if (!await tools.evaluate(node=>node.open)) await tools.locator('summary').click();
    await page.getByLabel('Ребро', {exact:true}).selectOption(`${from}:${to}`);
    const t = Number(fraction);
    const preset = Math.abs(t-.5)<1e-8 ? 'half' : Math.abs(t-1/3)<1e-8 ? 'third' : Math.abs(t-2/3)<1e-8 ? 'two-thirds' : null;
    if (preset) await page.locator(`[data-fraction="${preset}"]`).click();
    else await page.getByLabel('Положение от первой вершины, %', {exact:true}).fill(String(t*100));
    await page.getByTestId('add-edge-point').click();
  }
  await closeSheet(page);
}
export async function checkAnswer(page) {
  await page.getByTestId(await hasHud(page) ? 'hud-check' : 'check-answer').click();
}
export async function openMenuAction(page, action) {
  if (await hasHud(page)) {
    await closeSheet(page);
    await page.getByTestId('hud-menu').click();
    await page.locator(`[data-action="mobile-${action}"]`).click();
  } else {
    await page.locator(`[data-action="${action}"]`).first().click();
  }
}
export async function openSettings(page) {
  if (await hasHud(page)) {
    await closeSheet(page);
    await page.getByTestId('hud-menu').click();
    await page.locator('[data-action="settings-sheet"]').click();
  } else {
    await page.getByText('Настройки чертежа', { exact: true }).click();
  }
}

export async function chooseCourseLesson(page, lesson) {
  const module = page.locator(`.course-module[data-course-shape="${lesson.shapeId}"]`);
  if (!await module.evaluate(node => node.open)) await module.locator('summary').first().click();
  await page.getByTestId(`lesson-${lesson.id}`).click();
}

export async function answerLesson(page,lesson) {
  if (lesson.type === 'intersection' && lesson.relation !== 'intersecting') {
    await openPoints(page);
    await page.locator(`[data-action="answer-relation"][data-relation="${lesson.relation}"]`).click();
    await closeSheet(page);
  } else await selectVertices(page,lesson.target);
}
