import {test,expect} from '@playwright/test';
import {openSettings,closeSheet,selectVertices} from './helpers.js';

async function edgePixels(page,from,to){
  const points=await page.locator('#vertex-overlay').evaluate((overlay,ids)=>ids.map(id=>{
    const button=overlay.querySelector(`[data-vertex="${id}"]`);
    return [parseFloat(button.style.left),parseFloat(button.style.top)];
  }),[from,to]);
  const png=await page.locator('#canvas-host canvas').screenshot();
  return page.evaluate(async({png,points})=>{
    const image=new Image();image.src=`data:image/png;base64,${png}`;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
    const context=canvas.getContext('2d');context.drawImage(image,0,0);
    const [a,b]=points,values=[];
    for(let i=0;i<60;i++){
      const t=.2+.6*i/59,x=Math.round(a[0]+(b[0]-a[0])*t),y=Math.round(a[1]+(b[1]-a[1])*t);
      const pixels=context.getImageData(x-1,y-1,3,3).data;
      let red=255;for(let j=0;j<pixels.length;j+=4)red=Math.min(red,pixels[j]);values.push(red);
    }
    return {dark:values.filter(value=>value<200).length,gaps:values.filter(value=>value>205).length};
  },{png:png.toString('base64'),points});
}

test('rear labels fade, hidden edges are dashed, and visibility follows rotation without disabling selection',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  const rear=page.locator('.vertex-label[data-vertex="A"]');
  await expect(rear).toHaveAttribute('data-occluded','true');
  await expect(page.locator('.vertex-label[data-occluded="true"]')).toHaveCount(1);
  expect(await rear.evaluate(button=>parseFloat(getComputedStyle(button).opacity))).toBeLessThan(.6);
  const hidden=await edgePixels(page,'A','A1'),visible=await edgePixels(page,'B','B1');
  expect(hidden.dark).toBeGreaterThan(5);expect(hidden.gaps).toBeGreaterThan(5);
  expect(visible.dark).toBeGreaterThan(50);expect(visible.gaps).toBeLessThan(5);
  await page.screenshot({path:'releases/sechenie-hidden-edges-390.png'});
  await rear.click();await expect(rear).toHaveAttribute('aria-pressed','true');
  expect(await rear.evaluate(button=>parseFloat(getComputedStyle(button).opacity))).toBeGreaterThan(.5);
  const canvas=await page.locator('#canvas-host canvas').boundingBox();
  await page.mouse.move(canvas.x+canvas.width*.75,canvas.y+canvas.height*.55);
  await page.mouse.down();await page.mouse.move(canvas.x+canvas.width*.15,canvas.y+canvas.height*.55,{steps:12});await page.mouse.up();
  await expect(rear).toHaveAttribute('data-occluded','false');
  await expect(rear).toHaveAttribute('aria-pressed','true');
  await page.screenshot({path:'releases/sechenie-hidden-edges-rotated.png'});
  await page.getByRole('button',{name:'Исходный ракурс модели'}).click();
  await expect(rear).toHaveAttribute('data-occluded','true');
  await page.setViewportSize({width:1440,height:960});
  await expect(rear).toHaveAttribute('data-occluded','true');
  await page.screenshot({path:'releases/sechenie-hidden-edges-desktop.png'});
  expect(errors).toEqual([]);
});

test('rear edge-point labels remain selectable and keep their depth cue with face fill disabled',async({page})=>{
  await page.setViewportSize({width:320,height:568});await page.goto('/');
  await selectVertices(page,['edge:A:A1:0.5']);
  const point=page.locator('.edge-label');
  await expect(point).toHaveAttribute('data-occluded','true');
  await expect(point).toHaveAttribute('aria-pressed','true');
  expect(await point.evaluate(button=>parseFloat(getComputedStyle(button).opacity))).toBeLessThan(1);
  await openSettings(page);await page.getByRole('checkbox',{name:'Грани',exact:true}).uncheck();await closeSheet(page);
  await expect(point).toHaveAttribute('data-occluded','true');
  await expect(page.locator('.vertex-label[data-vertex="A"]')).toHaveAttribute('data-occluded','true');
  await expect(page.locator('.vertex-label[data-vertex="C1"]')).toHaveAttribute('data-occluded','false');
  await point.click();await expect(point).toHaveCount(0);
});
