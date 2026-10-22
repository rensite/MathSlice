import test from 'node:test';
import assert from 'node:assert/strict';
import { SHAPES, intersectPlane } from '../src/geometry.js';

const shape=SHAPES.cube;
const slices=[intersectPlane(shape,[[-1,0,-1],[1,0,-1],[1,0,1]]),intersectPlane(shape,[[-1,-1,0],[1,-1,0],[1,1,0]])];
const intersection={relation:'intersecting',line:{point:[0,0,0],direction:[1,0,0]},segment:[[-1,0,0],[1,0,0]]};
const linePositions=object=>{
  if(!object.isLine2)return Array.from(object.geometry.getAttribute('position').array);
  const start=object.geometry.getAttribute('instanceStart'),end=object.geometry.getAttribute('instanceEnd');
  return [start.getX(0),start.getY(0),start.getZ(0),end.getX(0),end.getY(0),end.getZ(0)];
};

test('two given planes have distinct colors but do not leak the intersection line before checking',async()=>{
  const {createPlaneIntersectionView}=await import('../src/intersection-view.js');
  const view=createPlaneIntersectionView(shape,slices,intersection,{showIntersection:false});
  const alpha=view.getObjectByName('plane-alpha'),beta=view.getObjectByName('plane-beta');
  assert.ok(alpha&&beta);
  assert.notEqual(alpha.getObjectByName('section-fill').material.color.getHex(),beta.getObjectByName('section-fill').material.color.getHex());
  assert.equal(view.getObjectByName('planes-intersection-line'),undefined);
  assert.equal(view.getObjectByName('planes-intersection-segment'),undefined);
});

test('revealed intersection distinguishes the extended straight line and its exact clipped segment',async()=>{
  const {createPlaneIntersectionView}=await import('../src/intersection-view.js');
  const before=JSON.stringify({slices,intersection});
  const view=createPlaneIntersectionView(shape,slices,intersection,{showIntersection:true});
  const line=linePositions(view.getObjectByName('planes-intersection-line'));
  const segment=linePositions(view.getObjectByName('planes-intersection-segment'));
  assert.equal(segment.length,6);
  assert.deepEqual(segment,[-1,0,0,1,0,0]);
  assert.ok(line[0]<-1&&line[3]>1);
  view.traverse(object=>{for(const number of object.geometry?.getAttribute('position')?.array||[])assert.ok(Number.isFinite(number));});
  assert.equal(JSON.stringify({slices,intersection}),before);
});

test('parallel planes have no invented line and coincident planes avoid double translucent fills',async()=>{
  const {createPlaneIntersectionView}=await import('../src/intersection-view.js');
  for(const relation of ['parallel','coincident']){
    const view=createPlaneIntersectionView(shape,relation==='coincident'?[slices[0],slices[0]]:slices,{relation,line:null,segment:[]},{showIntersection:true});
    assert.equal(view.getObjectByName('planes-intersection-line'),undefined);
    const fills=[];view.traverse(object=>{if(object.name==='section-fill')fills.push(object);});
    assert.equal(fills.length,relation==='coincident'?1:2);
  }
});

test('intersection highlight uses a thick screen-space stroke and wider halo without leaking before checking',async()=>{
  const {createPlaneIntersectionView}=await import('../src/intersection-view.js');
  const view=createPlaneIntersectionView(shape,slices,intersection,{showIntersection:true});
  const segment=view.getObjectByName('planes-intersection-segment');
  assert.equal(segment.isLine2,true,'native WebGL lines cannot reliably render a wide stroke');
  assert.equal(segment.material.worldUnits,false);
  assert.ok(segment.material.linewidth>=4);
  const halo=view.getObjectByName('planes-intersection-halo');
  assert.equal(halo.isLine2,true);
  assert.ok(halo.material.linewidth>=segment.material.linewidth+4);
  assert.ok(halo.material.transparent&&halo.material.opacity>0&&halo.material.opacity<.4);
  assert.ok(halo.renderOrder<segment.renderOrder);
  assert.equal(segment.material.depthTest,false);
  assert.equal(segment.material.transparent,true,'draw the stroke after translucent planes rather than underneath them');
  const start=segment.geometry.getAttribute('instanceStart'),end=segment.geometry.getAttribute('instanceEnd');
  assert.deepEqual([start.getX(0),start.getY(0),start.getZ(0),end.getX(0),end.getY(0),end.getZ(0)],[-1,0,0,1,0,0]);
  const hidden=createPlaneIntersectionView(shape,slices,intersection,{showIntersection:false});
  assert.equal(hidden.getObjectByName('planes-intersection-halo'),undefined);
  assert.equal(hidden.getObjectByName('planes-intersection-contrast'),undefined);
  segment.onBeforeRender({getViewport:target=>target.set(0,0,390,844)});
  assert.deepEqual(segment.material.resolution.toArray(),[390,844]);
  segment.onBeforeRender({getViewport:target=>target.set(0,0,320,568)});
  assert.deepEqual(segment.material.resolution.toArray(),[320,568]);
  const resources=[];view.traverse(object=>{if(object.geometry)resources.push(object.geometry);if(object.material)resources.push(object.material);});
  let disposed=0;resources.forEach(resource=>resource.addEventListener('dispose',()=>disposed++));
  resources.forEach(resource=>resource.dispose());assert.equal(disposed,resources.length);
});
