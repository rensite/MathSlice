import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

const close = (a, b, epsilon = 1e-5) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
const pointAt = (attribute, i) => new THREE.Vector3().fromBufferAttribute(attribute, i);
const triangleArea = (a, b, c) => b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
const areaOf = object => {
  const p = object.geometry.getAttribute('position');
  let area = 0;
  for (let i = 0; i < p.count; i += 3) area += triangleArea(...[i, i + 1, i + 2].map(j => pointAt(p, j)));
  return area;
};
const meshFixture = (closed = true) => ({
  vertices: [[-2, -2, -1], [2, -2, -1], [2, 2, 1], [-2, 2, 1]],
  triangles: [[0, 1, 2], [0, 2, 3]],
  bounds: { min: [-2, -2, -1], max: [2, 2, 1] }, closed,
});
const plane = { normal: [0, 0, 1], constant: 0 };
const square = (x = 0) => [[x - .5, -.5, 0], [x + .5, -.5, 0], [x + .5, .5, 0], [x - .5, .5, 0]];

test('structured wire follows complete supplied grid curves without triangulation diagonals', async()=>{
  const { createSurfaceModel } = await import('../src/surface-view.js');
  const mesh = {...meshFixture(),gridLines:[[0,1,2,3,0]]};
  const view = createSurfaceModel(mesh);
  const wire = view.getObjectByName('surface-wire').geometry.getAttribute('position');
  const expected = [0,1,1,2,2,3,3,0].map(index=>mesh.vertices[index]);
  assert.equal(wire.count,expected.length);
  expected.forEach((point,i)=>pointAt(wire,i).toArray().forEach((value,k)=>close(value,point[k])));
});

test('every actual surface supplies coherent sampled grid curves rather than isolated random strokes', async()=>{
  const { SURFACES,surfaceMesh } = await import('../src/surfaces.js');
  const { createSurfaceModel } = await import('../src/surface-view.js');
  for (const id of Object.keys(SURFACES)) {
    const mesh = surfaceMesh(id);
    assert.ok(mesh.gridLines?.length>0,id);
    for (const line of mesh.gridLines) {
      assert.ok(line.length>=3);
      line.forEach(index=>assert.ok(Number.isInteger(index)&&mesh.vertices[index]));
      for (let i=1;i<line.length;i++) assert.notEqual(line[i],line[i-1]);
    }
    const model = createSurfaceModel(mesh);
    assert.equal(model.getObjectByName('surface-wire').geometry.getAttribute('position').count,2*mesh.gridLines.reduce((sum,line)=>sum+line.length-1,0),id);
    model.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});
  }
});

// Build a real curved triangulation without depending on the surface catalog.
test('sphere model renders all triangles as toggleable DoubleSide faces with sparse disposable lines', async () => {
  const { createSurfaceModel } = await import('../src/surface-view.js');
  const source = new THREE.SphereGeometry(1, 48, 32);
  const position = source.getAttribute('position');
  const vertices = Array.from({ length: position.count }, (_, i) => pointAt(position, i).toArray());
  const indices = source.index.array;
  const triangles = Array.from({ length: indices.length / 3 }, (_, i) => Array.from(indices.slice(i * 3, i * 3 + 3)));
  const mesh = { vertices, triangles, bounds: { min: [-1, -1, -1], max: [1, 1, 1] }, closed: true };
  const before = JSON.stringify(mesh);
  const group = createSurfaceModel(mesh);
  assert.ok(group.isGroup);
  const face = group.children.find(child => child.userData.face);
  assert.ok(face?.isMesh);
  assert.equal(face.material.side, THREE.DoubleSide);
  assert.equal(face.geometry.getAttribute('position').count, triangles.length * 3);
  assert.equal(face.material.depthWrite, false);
  const lines = group.children.filter(child => child.isLine);
  assert.ok(lines.length > 0);
  const lineVertices = lines.reduce((sum, line) => sum + line.geometry.getAttribute('position').count, 0);
  assert.ok(lineVertices > 0 && lineVertices < triangles.length, 'curved mesh wire must be sparse');
  face.visible = false;
  assert.ok(lines.every(line => line.visible));
  let disposed = 0;
  group.traverse(child => {
    for (const resource of [child.geometry, child.material].filter(Boolean)) {
      resource.addEventListener('dispose', () => disposed++);
      resource.dispose();
    }
  });
  assert.equal(disposed, group.children.length * 2);
  assert.equal(JSON.stringify(mesh), before);
  source.dispose();
});

test('a triangular section has an exact hole, a separate fill and a bounds-sized plane', async () => {
  const { createSurfaceSection } = await import('../src/surface-view.js');
  const mesh = meshFixture();
  const slice = { paths: [{ points: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], closed: true }], area: .5 };
  const before = JSON.stringify({ mesh, plane, slice });
  const view = createSurfaceSection(mesh, plane, slice);
  const fill = view.getObjectByName('section-fill');
  const exterior = view.getObjectByName('plane-extension');
  const boundary = view.getObjectByName('plane-boundary');
  assert.ok(view.isGroup && fill?.isMesh && exterior?.isMesh && boundary?.isLine);
  close(areaOf(fill), .5);
  const p = boundary.geometry.getAttribute('position');
  const corners = [0, 1, 2, 3].map(i => pointAt(p, i));
  const outerArea = triangleArea(corners[0], corners[1], corners[2]) + triangleArea(corners[0], corners[2], corners[3]);
  close(areaOf(exterior) + areaOf(fill), outerArea);
  for (const corner of corners) assert.ok(Math.abs(corner.x) > 2 && Math.abs(corner.y) > 2);
  assert.ok(fill.renderOrder > exterior.renderOrder);
  assert.equal(exterior.material.side, THREE.DoubleSide);
  assert.equal(exterior.material.depthWrite, false);
  assert.ok(fill.material.opacity > exterior.material.opacity);
  assert.equal(JSON.stringify({ mesh, plane, slice }), before);
});

test('two open paths stay independent and unfilled without closing segments or exterior holes', async () => {
  const { createSurfaceSection } = await import('../src/surface-view.js');
  const paths = [
    { points: [[-1, -1, 0], [-1, 0, 0], [-.5, 1, 0]], closed: false },
    { points: [[1, -1, 0], [1, 1, 0]], closed: false },
  ];
  const view = createSurfaceSection(meshFixture(false), plane, { paths, area: null });
  assert.equal(view.getObjectByName('section-fill'), undefined);
  const outlines = view.children.filter(child => child.name === 'section-outline');
  assert.equal(outlines.length, 2);
  outlines.forEach((line, i) => {
    assert.equal(line.isLineLoop, undefined);
    const p = line.geometry.getAttribute('position');
    assert.equal(p.count, paths[i].points.length);
    for (let j = 0; j < p.count; j++) pointAt(p, j).toArray().forEach((value, k) => close(value, paths[i].points[j][k]));
  });
  const boundary = view.getObjectByName('plane-boundary').geometry.getAttribute('position');
  const corners = [0, 1, 2, 3].map(i => pointAt(boundary, i));
  close(areaOf(view.getObjectByName('plane-extension')), triangleArea(corners[0], corners[1], corners[2]) + triangleArea(corners[0], corners[2], corners[3]));
});

test('disjoint square loops produce two exact holes and fills without bridges', async () => {
  const { createSurfaceSection } = await import('../src/surface-view.js');
  const paths = [-1, 1].map(x => ({ points: square(x), closed: true }));
  paths[0].points.reverse(); // Input orientation must not affect hole subtraction.
  paths[1].points.push([...paths[1].points[0]]); // Explicit closure must not mutate inputs.
  const input = { mesh: meshFixture(), plane, slice: { paths, area: 2 } };
  const before = JSON.stringify(input);
  const view = createSurfaceSection(input.mesh, input.plane, input.slice);
  const fills = view.children.filter(child => child.name === 'section-fill');
  assert.equal(fills.length, 2);
  close(fills.reduce((sum, fill) => sum + areaOf(fill), 0), 2);
  const exterior = view.getObjectByName('plane-extension');
  const p = exterior.geometry.getAttribute('position');
  for (let i = 0; i < p.count; i += 3) {
    const center = [i, i + 1, i + 2].map(j => pointAt(p, j)).reduce((sum, v) => sum.add(v), new THREE.Vector3()).divideScalar(3);
    for (const x of [-1, 1]) assert.ok(Math.abs(center.x - x) >= .5 - 1e-6 || Math.abs(center.y) >= .5 - 1e-6);
  }
  for (const fill of fills) {
    const p = fill.geometry.getAttribute('position');
    const xs = Array.from({ length: p.count }, (_, i) => p.getX(i));
    assert.ok(Math.max(...xs) <= -.5 || Math.min(...xs) >= .5, 'a fill must never bridge independent loops');
  }
  const boundary = view.getObjectByName('plane-boundary').geometry.getAttribute('position');
  const corners = [0, 1, 2, 3].map(i => pointAt(boundary, i));
  close(areaOf(exterior) + 2, triangleArea(corners[0], corners[1], corners[2]) + triangleArea(corners[0], corners[2], corners[3]));
  assert.equal(JSON.stringify(input), before);
});

test('empty, zero-area and non-solid cuts retain their plane without creating solid fills', async () => {
  const { createSurfaceSection } = await import('../src/surface-view.js');
  for (const [mesh, slice] of [
    [meshFixture(), { paths: [], area: 0 }],
    [meshFixture(), { paths: [{ points: square(), closed: true }], area: 0 }],
    [meshFixture(false), { paths: [{ points: square(), closed: true }], area: 1 }],
    [meshFixture(), { paths: [{ points: [[0, 0, 0], [1, 0, 0], [2, 0, 0]], closed: true }], area: 1 }],
  ]) {
    const view = createSurfaceSection(mesh, plane, slice);
    assert.equal(view.getObjectByName('section-fill'), undefined);
    assert.ok(view.getObjectByName('plane-extension')?.isMesh);
    close(areaOf(view.getObjectByName('plane-extension')), areaOf(createSurfaceSection(mesh, plane, { paths: [], area: 0 }).getObjectByName('plane-extension')));
  }
});

test('scaled tilted plane normals preserve finite coplanar geometry and projected bounds', async () => {
  const { createSurfaceSection } = await import('../src/surface-view.js');
  const mesh = meshFixture();
  const n = new THREE.Vector3(2, 4, -2).normalize();
  const u = new THREE.Vector3(1, 0, 0).cross(n).normalize();
  const v = n.clone().cross(u);
  const origin = n.clone().multiplyScalar(.4);
  const points = square().map(([x, y]) => origin.clone().addScaledVector(u, x).addScaledVector(v, y).toArray());
  for (const scale of [1, 7, .01]) {
    const input = { normal: n.clone().multiplyScalar(scale).toArray(), constant: -.4 * scale };
    const view = createSurfaceSection(mesh, input, { paths: [{ points, closed: true }], area: 1 });
    close(areaOf(view.getObjectByName('section-fill')), 1);
    view.traverse(child => {
      const p = child.geometry?.getAttribute('position');
      if (!p) return;
      for (let i = 0; i < p.count; i++) {
        const point = pointAt(p, i);
        assert.ok(point.toArray().every(Number.isFinite));
        close(point.dot(n) - .4, 0);
      }
    });
    const boundary = view.getObjectByName('plane-boundary').geometry.getAttribute('position');
    const corners = [0, 1, 2, 3].map(i => pointAt(boundary, i));
    for (const axis of [u, v]) {
      const extent = corners.map(p => p.dot(axis));
      for (let i = 0; i < 8; i++) {
        const corner = new THREE.Vector3(...[0, 1, 2].map(j => mesh.bounds[(i >> j) & 1 ? 'max' : 'min'][j]));
        assert.ok(corner.dot(axis) > Math.min(...extent) && corner.dot(axis) < Math.max(...extent));
      }
    }
  }
});

test('invalid normals and constants fail explicitly instead of producing NaN geometry', async () => {
  const { createSurfaceSection } = await import('../src/surface-view.js');
  for (const invalid of [
    { normal: [0, 0, 0], constant: 0 },
    { normal: [0, 1], constant: 0 },
    { normal: [0, 0, 1, 5], constant: 0 },
    { normal: [NaN, 0, 1], constant: 0 },
    { normal: [Infinity, 0, 1], constant: 0 },
    { normal: [0, 0, 1], constant: Infinity },
  ]) assert.throws(() => createSurfaceSection(meshFixture(), invalid, { paths: [], area: 0 }), RangeError);
});
