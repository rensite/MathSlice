import test from 'node:test';
import assert from 'node:assert/strict';

test('planeFromPoints builds a unit plane through its inputs', async () => {
  const { planeFromPoints } = await load();
  const points = [[-1,-1,-1], [1,-1,-1], [1,1,1]];
  const plane = planeFromPoints(...points);
  close(Math.hypot(...plane.normal), 1);
  for (const p of points) close(p.reduce((s, x, i) => s + x * plane.normal[i], plane.constant), 0);
});

test('planeFromPoints rejects collinear, repeated, malformed and nonfinite points', async () => {
  const { planeFromPoints } = await load();
  for (const points of [
    [[0,0,0],[1,1,1],[2,2,2]], [[0,0,0],[0,0,0],[1,0,0]],
    [[NaN,0,0],[1,0,0],[0,1,0]], [[0,0,0],[Infinity,0,0],[0,1,0]],
    [[0,0],[1,0,0],[0,1,0]], [null,[1,0,0],[0,1,0]],
  ]) assert.throws(() => planeFromPoints(...points), Error);
  const tiny = planeFromPoints([0,0,0], [1e-12,0,0], [0,1e-12,0]);
  close(Math.hypot(...tiny.normal), 1);
});

test('cube diagonal A B C1 cuts an ordered rectangle of area 4 sqrt(2)', async () => {
  const { SHAPES, intersectPlane } = await load();
  const result = intersectPlane(SHAPES.cube, [[-1,-1,-1],[1,-1,-1],[1,1,1]]);
  assert.equal(result.points.length, 4);
  close(result.area, 4 * Math.sqrt(2));
  assert.deepEqual(pointSet(result.points), pointSet([[-1,-1,-1],[1,-1,-1],[1,1,1],[-1,1,1]]));
  for (const p of result.points) close(p.reduce((s,x,i) => s + x*result.normal[i], result.constant), 0);
  for (let i = 0; i < 4; i++) close(Math.hypot(...result.points[i].map((x,j) => x-result.points[(i+1)%4][j])), i % 2 ? Math.sqrt(8) : 2);
});

test('samePlane ignores input order and normal sign, not parallel offsets', async () => {
  const { samePlane } = await load();
  const p = [[0,0,0],[1,0,0],[0,1,0]];
  assert.equal(samePlane(p,[p[2],p[1],p[0]]), true);
  assert.equal(samePlane(p,[[2,3,0],[4,3,0],[2,7,0]]), true);
  assert.equal(samePlane(p,[[0,0,1],[1,0,1],[0,1,1]]), false);
  assert.equal(samePlane(p,[[0,0,0],[1,0,0],[0,0,1]]), false);
  assert.equal(samePlane(p,p.map(q => [q[0],q[1],5e-7])), true);
  assert.equal(samePlane(p,p.map(q => [q[0],q[1],5e-7]),1e-8), false);
});

test('coplanar cube bottom returns four unique vertices and area 4', async () => {
  const { SHAPES, intersectPlane } = await load();
  const result = intersectPlane(SHAPES.cube, [[-1,-1,-1],[1,-1,-1],[1,-1,1]]);
  close(result.area,4);
  assert.deepEqual(pointSet(result.points), pointSet([[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]]));
});

test('cube corner midpoint triangle has area sqrt(3)/2', async () => {
  const { SHAPES, intersectPlane } = await load();
  const points = [[0,-1,-1],[-1,0,-1],[-1,-1,0]];
  const result = intersectPlane(SHAPES.cube, points);
  assert.deepEqual(pointSet(result.points),pointSet(points));
  close(result.area,Math.sqrt(3)/2);
});

test('central cube hexagon is cyclically ordered with area 3 sqrt(3)', async () => {
  const { SHAPES, intersectPlane } = await load();
  const result = intersectPlane(SHAPES.cube, [[1,-1,0],[1,0,-1],[0,1,-1]]);
  assert.equal(result.points.length,6);
  close(result.area,3*Math.sqrt(3));
  for (let i = 0; i < 6; i++) close(Math.hypot(...result.points[i].map((x,j) => x-result.points[(i+1)%6][j])), Math.sqrt(2));
});

test('prism and pyramid sections have analytic areas', async () => {
  const { SHAPES, intersectPlane } = await load();
  for (const [id, points, count, area] of [
    ['prism',[[0,0,0],[1,0,0],[0,0,1]],3,1.8],
    ['prism',[[-1,-1,-.8],[1,-1,-.8],[0,-1,1]],3,1.8],
    ['pyramid',[[0,.25,0],[1,.25,0],[0,.25,1]],4,1],
    ['pyramid',[[0,-1,-1],[0,-1,1],[0,1.5,0]],3,2.5],
    ['pyramid',[[-1,-1,-1],[1,-1,-1],[1,-1,1]],4,4],
  ]) {
    const result = intersectPlane(SHAPES[id],points);
    assert.equal(result.points.length,count);
    close(result.area,area);
  }
});

test('disjoint, vertex-only and edge-only cuts consistently return no polygon', async () => {
  const { SHAPES, intersectPlane } = await load();
  for (const points of [
    [[0,2,0],[1,2,0],[0,2,1]],
    [[3,0,0],[0,3,0],[0,0,3]],
    [[1,1,-1],[1,1,1],[2,0,0]],
  ]) {
    const result = intersectPlane(SHAPES.cube,points);
    assert.deepEqual(result.points,[]);
    assert.equal(result.area,0);
    close(Math.hypot(...result.normal),1);
    assert.ok(Number.isFinite(result.constant));
  }
});

test('all six plane point permutations preserve section vertices and area', async () => {
  const { SHAPES, intersectPlane, samePlane } = await load();
  const points = [[0,-1,-1],[-1,0,-1],[-1,-1,0]];
  const expected = intersectPlane(SHAPES.cube,points);
  for (const order of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]) {
    const permuted = order.map(i => points[i]);
    const result = intersectPlane(SHAPES.cube,permuted);
    close(result.area,expected.area);
    assert.deepEqual(pointSet(result.points),pointSet(expected.points));
    assert.equal(samePlane(points,permuted),true);
  }
});

test('duplicate and reversed edges do not duplicate intersections or mutate inputs', async () => {
  const { SHAPES, intersectPlane } = await load();
  const shape = structuredClone(SHAPES.cube);
  shape.edges.push(...shape.edges.map(([a,b]) => [b,a]),...shape.edges.map(e => [...e]));
  const points = [[-1,-1,-1],[1,-1,-1],[1,1,1]];
  const before = JSON.stringify({shape,points});
  const result = intersectPlane(shape,points);
  assert.equal(result.points.length,4);
  close(result.area,4*Math.sqrt(2));
  assert.equal(JSON.stringify({shape,points}),before);
  result.points[0][0] = 99;
  assert.equal(JSON.stringify({shape,points}),before);
});

test('section and plane comparison reject invalid plane triplets and tolerance', async () => {
  const { SHAPES, intersectPlane, samePlane } = await load();
  const valid = [[0,0,0],[1,0,0],[0,1,0]];
  for (const invalid of [[],valid.slice(0,2),[...valid,[0,0,1]],[[0,0,0],[1,1,1],[2,2,2]],[[NaN,0,0],[1,0,0],[0,1,0]],null]) {
    assert.throws(() => intersectPlane(SHAPES.cube,invalid), Error);
    assert.throws(() => samePlane(invalid,valid), Error);
    assert.throws(() => samePlane(valid,invalid), Error);
  }
  for (const t of [-1,NaN,Infinity,'1']) assert.throws(() => samePlane(valid,valid,t),Error);
});

const pointSet = points => points.map(p => p.map(x => Math.abs(x) < 1e-10 ? 0 : +x.toFixed(9)).join(',')).sort();
const load = () => import('../src/geometry.js');
const close = (actual, expected, eps = 1e-9) => assert.ok(Math.abs(actual - expected) <= eps, `${actual} ≠ ${expected}`);

test('shape catalog has the contracted coordinates and closed topology', async () => {
  const { SHAPES } = await load();
  assert.deepEqual(Object.keys(SHAPES), ['cube', 'prism', 'pyramid', 'cuboid', 'hexprism', 'octahedron']);
  const coordinates = {
    cube: [[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1],[-1,1,-1],[1,1,-1],[1,1,1],[-1,1,1]],
    prism: [[-1,-1,-.8],[1,-1,-.8],[0,-1,1],[-1,1,-.8],[1,1,-.8],[0,1,1]],
    pyramid: [[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1],[0,1.5,0]],
  };
  for (const [key, shape] of Object.entries(SHAPES)) {
    assert.equal(shape.id, key);
    assert.ok(shape.name);
    if (coordinates[key]) assert.deepEqual(shape.vertices.map(v => v.position), coordinates[key]);
    const counts = { cube: [8,12,6], prism: [6,9,5], pyramid: [5,8,5], cuboid: [8,12,6], hexprism: [12,18,8], octahedron: [6,12,8] };
    assert.deepEqual([shape.vertices.length, shape.edges.length, shape.faces.length], counts[key]);
    assert.equal(Math.min(...shape.vertices.map(v => v.position[1])), -1);
    for (const face of shape.faces) {
      const points = face.map(id => shape.vertices.find(v => v.id === id).position);
      const plane = (await load()).planeFromPoints(...points.slice(0,3));
      const distance = p => p.reduce((sum,x,i) => sum + x * plane.normal[i], plane.constant);
      for (const p of points) close(distance(p), 0);
      const distances = shape.vertices.map(v => distance(v.position));
      assert.ok(distances.every(d => d <= 1e-8) || distances.every(d => d >= -1e-8), `${key}: convex supporting face`);
      const polygon = (await load()).intersectPlane(shape, points.slice(0,3));
      assert.equal(polygon.points.length, face.length, `${key}: no missing or collinear face vertices`);
      assert.ok(polygon.area > 0);
    }
    assert.equal(shape.vertices.length - shape.edges.length + shape.faces.length, 2);
    const ids = new Set(shape.vertices.map(v => v.id));
    assert.equal(ids.size, shape.vertices.length);
    for (const v of shape.vertices) assert.equal(v.label, v.id);
    const edgeKey = ([a,b]) => [a,b].sort().join(':');
    const edges = new Set(shape.edges.map(edgeKey));
    assert.equal(edges.size, shape.edges.length);
    const uses = new Map();
    for (const face of shape.faces) for (let i = 0; i < face.length; i++) {
      assert.ok(ids.has(face[i]));
      const edge = edgeKey([face[i], face[(i+1)%face.length]]);
      assert.ok(edges.has(edge));
      uses.set(edge, (uses.get(edge) ?? 0) + 1);
    }
    for (const edge of edges) assert.equal(uses.get(edge), 2);
  }
});
