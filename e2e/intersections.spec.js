import {test,expect} from '@playwright/test';
import {LESSONS,validateAnswer} from '../src/lessons.js';
import {SHAPES} from '../src/geometry.js';
import {STORAGE_KEY} from '../src/progress.js';
import {openPoints,closeSheet,selectVertices,openMenuAction,chooseCourseLesson,checkAnswer} from './helpers.js';

async function openIntersection(page,lesson){
  await openMenuAction(page,'library');await chooseCourseLesson(page,lesson);
}
async function answer(page,lesson){
  if(lesson.relation==='intersecting')await selectVertices(page,lesson.target);
  else{await openPoints(page);await page.locator(`[data-action="answer-relation"][data-relation="${lesson.relation}"]`).click();await closeSheet(page);}
}

test('lab adds an independent second plane without changing single-plane tasks',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  await openMenuAction(page,'lab');await selectVertices(page,['A','B','C']);
  await openPoints(page);await page.getByRole('button',{name:'Добавить плоскость β',exact:true}).click();
  await expect(page.locator('[data-action="active-plane"][data-plane="1"]')).toHaveAttribute('aria-pressed','true');
  await closeSheet(page);await selectVertices(page,['A','B','A1']);
  await openPoints(page);await expect(page.locator('#slice-info')).toContainText('Пересекаются');
  await page.locator('[data-action="active-plane"][data-plane="0"]').click();
  await expect(page.locator('#selected-points')).toHaveText('ABC');
  await page.getByRole('button',{name:'Убрать β',exact:true}).click();
  await expect(page.locator('#selected-points')).toHaveText('ABC');
  await closeSheet(page);await openMenuAction(page,'training');await openPoints(page);
  await expect(page.locator('[data-action="active-plane"]')).toHaveCount(0);
  await expect(page.locator('[data-action="answer-relation"]')).toHaveCount(0);
  await expect(page.locator('#selected-count')).toHaveText('0 из 3');
});

test('all two-plane tasks check answers and preserve earned progress without exposing the line beforehand',async({page})=>{
  test.setTimeout(90_000);await page.setViewportSize({width:390,height:844});await page.goto('/');
  const lessons=LESSONS.filter(item=>item.type==='intersection');expect(lessons.length).toBeGreaterThan(0);
  let solved=0;
  for(const lesson of lessons){
    await openIntersection(page,lesson);
    await expect(page.locator('#stage')).toHaveAttribute('data-intersection-visible','false');
    await expect(page.getByTestId('hud-check')).toBeDisabled();
    await answer(page,lesson);await checkAnswer(page);
    await expect(page.locator('.feedback.success')).toBeVisible();
    await expect(page.getByTestId('progress-count')).toHaveText(`${++solved} / ${LESSONS.length}`);
    await closeSheet(page);
    if(lesson.relation==='intersecting')await expect(page.locator('#stage')).toHaveAttribute('data-intersection-visible','true');
  }
  await page.reload();await expect(page.getByTestId('progress-count')).toHaveText(`${solved} / ${LESSONS.length}`);
});

test('wrong intersection is rejected and reveal stays unearned after reload on a narrow phone',async({page})=>{
  await page.setViewportSize({width:320,height:568});await page.goto('/');
  const lesson=LESSONS.find(item=>item.type==='intersection'&&item.relation==='intersecting');expect(lesson).toBeTruthy();
  await openIntersection(page,lesson);
  const vertices=SHAPES[lesson.shapeId].vertices.map(vertex=>vertex.id);
  const wrong=vertices.flatMap((a,i)=>vertices.slice(i+1).map(b=>[a,b])).find(pair=>!validateAnswer(lesson,pair,'intersecting').correct);
  await selectVertices(page,wrong);await checkAnswer(page);await expect(page.locator('.feedback.try-again')).toBeVisible();
  await expect(page.getByTestId('progress-count')).toHaveText(`0 / ${LESSONS.length}`);
  await page.getByTestId('reveal-answer').click();await expect(page.locator('.feedback.revealed')).toContainText('не засчитывается');
  await expect(page.locator('#stage')).toHaveAttribute('data-intersection-visible','true');
  await closeSheet(page);await page.reload();await openIntersection(page,lesson);await answer(page,lesson);
  await expect(page.getByTestId('hud-check')).toBeDisabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(320);
  await page.screenshot({path:'releases/sechenie-two-planes-320.png'});
});

test('all forty-two legacy completions survive and continuation enters the first two-plane task',async({page})=>{
  await page.addInitScript(({key,ids})=>localStorage.setItem(key,JSON.stringify({version:1,solved:ids,hints:[]})),{key:STORAGE_KEY,ids:LESSONS.slice(0,42).map(lesson=>lesson.id)});
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  await expect(page.getByTestId('progress-count')).toHaveText(`42 / ${LESSONS.length}`);
  await openMenuAction(page,'library');await page.locator('[data-action="continue-course"]').click();
  await expect(page.locator('#hud-task-title')).toHaveText(`Задание 43 / ${LESSONS.length}`);
  await openPoints(page);await expect(page.locator('#selected-count')).toHaveText('0 из 2');
  await expect(page.locator('[data-action="answer-relation"]')).toHaveCount(3);
});

test('two-plane answers and classification remain usable without WebGL',async({page})=>{
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return /^webgl/.test(kind)?null:original.call(this,kind,...args);};});
  await page.setViewportSize({width:320,height:568});await page.goto('/');
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  let solved=0;
  for(const relation of ['intersecting','parallel','coincident']){
    const lesson=LESSONS.find(item=>item.type==='intersection'&&item.relation===relation);
    await openIntersection(page,lesson);await answer(page,lesson);await checkAnswer(page);
    await expect(page.locator('.feedback.success')).toBeVisible();
    await expect(page.getByTestId('progress-count')).toHaveText(`${++solved} / ${LESSONS.length}`);
  }
  expect(errors).toEqual([]);
});
