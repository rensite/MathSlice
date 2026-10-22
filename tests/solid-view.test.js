import test from 'node:test';
import assert from 'node:assert/strict';
import { SHAPES } from '../src/geometry.js';

const positions=line=>Array.from(line.geometry.getAttribute('position').array.slice(0,line.geometry.drawRange.count*3));

test('solid edges split into solid visible strokes and faint genuinely dashed hidden strokes',async()=>{
  const {createSolidEdges,updateSolidEdges}=await import('../src/solid-view.js');
  const shape=SHAPES.cube,view=createSolidEdges(shape);
  const visible=view.getObjectByName('solid-visible-edges'),hidden=view.getObjectByName('solid-hidden-edges');
  assert.ok(visible.isLineSegments&&hidden.isLineSegments);
  assert.equal(hidden.material.isLineDashedMaterial,true);
  assert.ok(hidden.material.transparent&&hidden.material.opacity<visible.material.opacity);
  assert.ok(hidden.material.dashSize>0&&hidden.material.gapSize>0);
  const mask=shape.edges.map(([a,b])=>a!=='A'&&b!=='A');
  updateSolidEdges(view,mask);
  const expected=flag=>shape.edges.filter((_,i)=>mask[i]===flag).flatMap(edge=>edge.flatMap(id=>shape.vertices.find(v=>v.id===id).position));
  assert.deepEqual(positions(visible),expected(true));
  assert.deepEqual(positions(hidden),expected(false));
  assert.ok(hidden.geometry.getAttribute('lineDistance'));
  const version=visible.geometry.getAttribute('position').version;
  updateSolidEdges(view,[...mask]);
  assert.equal(visible.geometry.getAttribute('position').version,version,'camera changes without visibility changes do not upload new buffers');
  updateSolidEdges(view,mask.map(flag=>!flag));
  assert.deepEqual(positions(visible),expected(false));
  assert.deepEqual(positions(hidden),expected(true));
  assert.ok(visible.geometry.boundingSphere.radius>0&&hidden.geometry.boundingSphere.radius>0);
  for(const line of [visible,hidden]){
    for(const attribute of Object.values(line.geometry.attributes))for(const value of attribute.array)assert.ok(Number.isFinite(value));
    let disposed=0;line.geometry.addEventListener('dispose',()=>disposed++);line.material.addEventListener('dispose',()=>disposed++);
    line.geometry.dispose();line.material.dispose();assert.equal(disposed,2);
  }
});
