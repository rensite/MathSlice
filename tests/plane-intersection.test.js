import test from 'node:test';
import assert from 'node:assert/strict';
import { intersectPlanes } from '../src/plane-intersection.js';

import { SHAPES } from '../src/geometry.js';

const plane = (normal, constant = 0) => ({normal, constant});
const close = (a,b,eps=1e-8) => a.forEach((x,i) => assert.ok(Math.abs(x-b[i]) < eps, `${a} != ${b}`));
test('known axis intersection returns closest line point and unit direction without mutation', () => {
  const a = plane([2,0,0],-4), b = plane([0,3,0],-9);
  const before = JSON.stringify([a,b]);
  const hit = intersectPlanes(a,b);
  assert.equal(hit.relation, 'intersecting');
  close(hit.line.point, [2,3,0]);
  close(hit.line.direction, [0,0,1]);
  assert.deepEqual(hit.segment, []);
  assert.equal(JSON.stringify([a,b]),before);
});

test('normalized relation ignores scale and opposite signs, including near parallel normals', () => {
  for (const factor of [1e-200, -1e200, -7]) {
    assert.deepEqual(intersectPlanes(plane([2,0,0],-4),plane([factor,0,0],-2*factor)), {relation:'coincident',line:null,segment:[]});
    assert.equal(intersectPlanes(plane([1,0,0],-2),plane([factor,0,0],-3*factor)).relation,'parallel');
  }
  assert.equal(intersectPlanes(plane([1,0,0]),plane([1,1e-12,0],-1)).relation,'parallel');
  assert.equal(intersectPlanes(plane([1,0,0]),plane([-1,-1e-12,0])).relation,'coincident');
  assert.equal(intersectPlanes(plane([1,0,0]),plane([1,1e-5,0],-1)).relation,'intersecting');
});

test('convex clipping handles axis, oblique, exterior and vertex tangency with arbitrary face winding', () => {
  const shape = structuredClone(SHAPES.cube);
  shape.faces = shape.faces.map((f,i) => i%2 ? [...f].reverse() : f);
  const before = JSON.stringify(shape);
  const hits = intersectPlanes(plane([1,0,0],-.25),plane([0,1,0],.5),shape);
  close(hits.segment[0],[.25,-.5,-1]); close(hits.segment[1],[.25,-.5,1]);
  const skew = intersectPlanes(plane([1,-1,0]),plane([0,1,-1]),shape);
  close(skew.segment[0],[-1,-1,-1]); close(skew.segment[1],[1,1,1]);
  const outside = intersectPlanes(plane([1,0,0],-2),plane([0,1,0]),shape);
  assert.equal(outside.relation,'intersecting'); assert.deepEqual(outside.segment,[]);
  const tangent = intersectPlanes(plane([1,1,0],-2),plane([0,0,1],-1),shape);
  assert.equal(tangent.segment.length,1); close(tangent.segment[0],[1,1,1]);
  const edge = intersectPlanes(plane([1,0,0],-1),plane([0,1,0],-1),shape);
  assert.equal(edge.segment.length,2); close(edge.segment[0],[1,1,-1]); close(edge.segment[1],[1,1,1]);
  assert.equal(JSON.stringify(shape),before);
});

test('normalization avoids intermediate overflow for representable distant planes', () => {
  const a = plane([1e-308,1e-308,0],2);
  const b = plane([.5,.5,0],1e308);
  assert.deepEqual(intersectPlanes(a,b),{relation:'coincident',line:null,segment:[]});
});

test('invalid finite/nonzero plane equations throw rather than produce NaN', () => {
  for (const malformed of [null, {},plane([0,0,0]),plane([1,0]),plane([NaN,0,1]),plane([1,0,0],Infinity),plane([1,0,0], '0'),plane([Number.MIN_VALUE,0,0],1)]) {
    assert.throws(() => intersectPlanes(malformed,plane([0,1,0])));
  }
});
