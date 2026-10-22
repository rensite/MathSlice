import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SHAPES, intersectPlane } from '../src/geometry.js';

const sliceFor = (shape, ids) => intersectPlane(shape, ids.map(id => shape.vertices.find(v => v.id === id).position));
const triangleArea = (a, b, c) => new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).length() / 2;
const pointAt = (attribute, i) => new THREE.Vector3().fromBufferAttribute(attribute, i);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);

test('a face-coincident plane extends beyond the cube with a transparent exterior and no double-filled section', async () => {
  const { createSectionView } = await import('../src/section-view.js');
  const slice = sliceFor(SHAPES.cube, ['A', 'B', 'C']);
  const before = JSON.stringify(slice);
  const view = createSectionView(SHAPES.cube, slice);
  const exterior = view.getObjectByName('plane-extension');
  const fill = view.getObjectByName('section-fill');
  const boundary = view.getObjectByName('plane-boundary');
  assert.ok(exterior?.isMesh);
  assert.ok(fill?.isMesh);
  assert.ok(boundary?.isLine);
  assert.equal(exterior.material.transparent, true);
  assert.ok(exterior.material.opacity > 0 && exterior.material.opacity < .25);
  assert.ok(fill.material.opacity > exterior.material.opacity);
  assert.equal(exterior.material.depthWrite, false);
  assert.equal(fill.material.depthWrite, false);
  assert.equal(exterior.material.side, THREE.DoubleSide);
  const positions = exterior.geometry.getAttribute('position');
  let area = 0;
  for (let i = 0; i < positions.count; i += 3) {
    const points = [i, i + 1, i + 2].map(j => pointAt(positions, j));
    for (const p of points) close(p.dot(new THREE.Vector3(...slice.normal)) + slice.constant, 0);
    const center = points.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / 3);
    assert.ok(Math.abs(center.x) > 1 || Math.abs(center.z) > 1, 'exterior triangle must not fill the square section');
    area += triangleArea(...points);
  }
  const outer = boundary.geometry.getAttribute('position');
  assert.ok(outer.count >= 4);
  const rectangle = [0, 1, 2, 3].map(i => pointAt(outer, i));
  const outerArea = triangleArea(rectangle[0], rectangle[1], rectangle[2]) + triangleArea(rectangle[0], rectangle[2], rectangle[3]);
  close(area + slice.area, outerArea);
  assert.ok(area > 0);
  assert.ok(rectangle.some(p => Math.abs(p.x) > 1.2 || Math.abs(p.z) > 1.2));
  assert.equal(JSON.stringify(slice), before);
});

test('extended plane stays coplanar and leaves a precise hole for every catalog section', async () => {
  const { createSectionView } = await import('../src/section-view.js');
  let cases = 0;
  for (const shape of Object.values(SHAPES)) {
    for (let a = 0; a < shape.vertices.length; a++) for (let b = a + 1; b < shape.vertices.length; b++) for (let c = b + 1; c < shape.vertices.length; c++) {
      let slice;
      try { slice = intersectPlane(shape, [a, b, c].map(i => shape.vertices[i].position)); } catch { continue; }
      if (!slice.points.length) continue;
      const view = createSectionView(shape, slice);
      const mesh = view.getObjectByName('plane-extension');
      const positions = mesh.geometry.getAttribute('position');
      const normal = new THREE.Vector3(...slice.normal);
      const polygon = slice.points.map(p => new THREE.Vector3(...p));
      let exteriorArea = 0;
      for (let i = 0; i < positions.count; i += 3) {
        const triangle = [i, i + 1, i + 2].map(j => pointAt(positions, j));
        triangle.forEach(p => close(p.dot(normal) + slice.constant, 0));
        exteriorArea += triangleArea(...triangle);
        const center = triangle.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / 3);
        const inside = polygon.every((p, j) => new THREE.Vector3().subVectors(polygon[(j + 1) % polygon.length], p).cross(new THREE.Vector3().subVectors(center, p)).dot(normal) >= -1e-6);
        assert.equal(inside, false, `${shape.id}: exterior triangle overlaps section`);
      }
      const outer = view.getObjectByName('plane-boundary').geometry.getAttribute('position');
      const p = [0, 1, 2, 3].map(i => pointAt(outer, i));
      close(exteriorArea + slice.area, triangleArea(p[0], p[1], p[2]) + triangleArea(p[0], p[2], p[3]));
      assert.ok(view.getObjectByName('section-fill').renderOrder > mesh.renderOrder);
      cases++;
      view.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
    }
  }
  assert.ok(cases > 20);
});

test('incomplete or degenerate previews leave no stale extended plane', async () => {
  const { createSectionView } = await import('../src/section-view.js');
  for (const slice of [null, { points: [] }, { points: [[0, 0, 0], [1, 0, 0]] }]) {
    assert.equal(createSectionView(SHAPES.cube, slice).children.length, 0);
  }
});
