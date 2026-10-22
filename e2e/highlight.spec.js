import {test,expect} from '@playwright/test';
import {LESSONS} from '../src/lessons.js';
import {openMenuAction,chooseCourseLesson,selectVertices,checkAnswer,closeSheet} from './helpers.js';

// Inspect actual composited canvas pixels, including the wide-line shader result.
async function highlightPixels(page){
  const png=await page.locator('#canvas-host canvas').screenshot();
  return page.evaluate(async png=>{
    const image=new Image();image.src=`data:image/png;base64,${png}`;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
    const context=canvas.getContext('2d');context.drawImage(image,0,0);
    const data=context.getImageData(0,0,canvas.width,canvas.height).data;
    let count=0;
    for(let i=0;i<data.length;i+=4)if(data[i+1]>130&&data[i+1]>data[i]+35&&data[i+1]>data[i+2]+15)count++;
    return count;
  },png.toString('base64'));
}

test('bright intersection highlight stays hidden before checking and survives phone/desktop resizing',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  const lesson=LESSONS.find(item=>item.type==='intersection'&&item.relation==='intersecting');
  await openMenuAction(page,'library');await chooseCourseLesson(page,lesson);await closeSheet(page);
  expect(await highlightPixels(page)).toBe(0);
  await selectVertices(page,lesson.target);
  expect(await highlightPixels(page)).toBe(0);
  await checkAnswer(page);await expect(page.locator('.feedback.success')).toBeVisible();await closeSheet(page);
  expect(await highlightPixels(page)).toBeGreaterThan(200);
  await page.screenshot({path:'releases/sechenie-intersection-highlight-390.png'});
  await page.setViewportSize({width:320,height:568});
  expect(await highlightPixels(page)).toBeGreaterThan(150);
  await page.screenshot({path:'releases/sechenie-intersection-highlight-320.png'});
  await page.setViewportSize({width:1440,height:960});
  expect(await highlightPixels(page)).toBeGreaterThan(150);
  await page.screenshot({path:'releases/sechenie-intersection-highlight-desktop.png'});
  expect(errors).toEqual([]);
});
