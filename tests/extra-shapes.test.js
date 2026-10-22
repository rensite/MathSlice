import test from 'node:test';
import assert from 'node:assert/strict';
import { intersectPlane, planeFromPoints, SHAPES } from '../src/geometry.js';
import { edgePointId, resolvePoint } from '../src/points.js';

const catalog = {
  tetrahedron: ['Правильный тетраэдр', 'Тетраэдр', 4, 6, 4],
  obliqueprism: ['Наклонная треугольная призма', 'Наклонная призма', 6, 9, 5],
  obliquecuboid: ['Наклонный параллелепипед', 'Наклонный параллелепипед', 8, 12, 6],
  pentaprism: ['Правильная пятиугольная призма', 'Пятиугольная призма', 10, 15, 7],
  pentapyramid: ['Правильная пятиугольная пирамида', 'Пятиугольная пирамида', 6, 10, 6],
  truncatedpyramid: ['Правильная усечённая четырёхугольная пирамида', 'Усечённая пирамида', 8, 12, 6],
  dodecahedron: ['Правильный додекаэдр', 'Додекаэдр', 20, 30, 12],
  icosahedron: ['Правильный икосаэдр', 'Икосаэдр', 12, 30, 20],
};
const load = async () => (await import('../src/extra-shapes.js')).EXTRA_SHAPES;

test('extra catalog has exactly eight independent Russian-named entries', async () => {
  const extra = await load();
  assert.deepEqual(Object.keys(extra), Object.keys(catalog));
  for (const [id, [name, shortName]] of Object.entries(catalog)) {
    assert.equal(extra[id].id, id);
    assert.equal(extra[id].name, name);
    assert.equal(extra[id].shortName, shortName);
    assert.ok(!Object.hasOwn(SHAPES, id));
  }
  assert.equal(Object.keys(SHAPES).length, 6);
});

const epsilon = 1e-8;
const close = (a, b) => assert.ok(Math.abs(a - b) < epsilon, `${a} ≠ ${b}`);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const edgeKey = (a, b) => [a, b].sort().join(':');

for (const [id, [, , vertexCount, edgeCount, faceCount]] of Object.entries(catalog)) {
  test(`${id}: bounded finite vertices and closed convex polygon topology`, async () => {
    const shape = (await load())[id];
    assert.ok(Array.isArray(shape.vertices), 'shape vertices exist');
    assert.deepEqual([shape.vertices.length, shape.edges.length, shape.faces.length], [vertexCount, edgeCount, faceCount]);
    assert.equal(vertexCount - edgeCount + faceCount, 2);
    const vertices = new Map(shape.vertices.map(v => [v.id, v.position]));
    assert.equal(vertices.size, vertexCount);
    assert.equal(new Set(shape.vertices.map(v => JSON.stringify(v.position))).size, vertexCount);
    for (const vertex of shape.vertices) {
      assert.match(vertex.id, /^[A-Z][A-Z0-9]*$/);
      assert.equal(vertex.label, vertex.id);
      assert.equal(vertex.position.length, 3);
      assert.ok(vertex.position.every(x => Number.isFinite(x) && x >= -1.3 - epsilon && x <= 1.5 + epsilon));
    }
    close(Math.min(...shape.vertices.map(v => v.position[1])), -1);
    const edges = new Set();
    const neighbors = new Map([...vertices.keys()].map(key => [key, new Set()]));
    for (const edge of shape.edges) {
      assert.equal(edge.length, 2);
      const [a, b] = edge;
      assert.ok(vertices.has(a) && vertices.has(b) && a !== b);
      const key = edgeKey(a, b);
      assert.ok(!edges.has(key), 'no duplicate edges');
      edges.add(key);
      neighbors.get(a).add(b);
      neighbors.get(b).add(a);
    }
    const reached = new Set();
    const visit = key => { if (reached.has(key)) return; reached.add(key); for (const next of neighbors.get(key)) visit(next); };
    visit(shape.vertices[0].id);
    assert.equal(reached.size, vertexCount, 'connected graph');
    for (const adjacent of neighbors.values()) assert.ok(adjacent.size >= 3);
    const uses = new Map();
    const directions = new Map();
    const faceKeys = new Set();
    for (const face of shape.faces) {
      assert.ok(face.length >= 3);
      assert.equal(new Set(face).size, face.length);
      const faceKey = [...face].sort().join(':');
      assert.ok(!faceKeys.has(faceKey));
      faceKeys.add(faceKey);
      assert.ok(face.every(key => vertices.has(key)));
      const points = face.map(key => vertices.get(key));
      const { normal, constant } = planeFromPoints(...points.slice(0, 3));
      const distance = p => dot(normal, p) + constant;
      for (const point of points) close(distance(point), 0);
      for (const point of vertices.values()) assert.ok(distance(point) <= epsilon, 'outward supporting plane');
      assert.ok([...vertices.values()].some(p => distance(p) < -epsilon), 'positive volume');
      for (let i = 0; i < face.length; i++) {
        const a = face[i], b = face[(i + 1) % face.length];
        const key = edgeKey(a, b);
        assert.ok(edges.has(key), 'every face side is a model edge');
        uses.set(key, (uses.get(key) ?? 0) + 1);
        directions.set(key, (directions.get(key) ?? 0) + (a < b ? 1 : -1));
        const turn = cross(sub(points[(i + 1) % face.length], points[i]), sub(points[(i + 2) % face.length], points[(i + 1) % face.length]));
        assert.ok(dot(turn, normal) > epsilon, 'strictly convex ordered face');
      }
      const section = intersectPlane(shape, points.slice(0, 3));
      assert.equal(section.points.length, face.length, 'supporting cut yields full polygon, without internal diagonal edges');
      assert.ok(section.area > epsilon);
    }
    for (const edge of edges) {
      assert.equal(uses.get(edge), 2, 'each edge belongs to two faces');
      assert.equal(directions.get(edge), 0, 'neighboring faces traverse shared edge oppositely');
    }
    if (id === 'dodecahedron') assert.ok(shape.faces.every(face => face.length === 5));
    if (id === 'icosahedron' || id === 'tetrahedron') assert.ok(shape.faces.every(face => face.length === 3));
    if (['tetrahedron', 'dodecahedron', 'icosahedron'].includes(id)) {
      const lengths = shape.edges.map(([a, b]) => Math.hypot(...sub(vertices.get(a), vertices.get(b))));
      for (const length of lengths) close(length, lengths[0]);
      const center = [0, 1, 2].map(i => shape.vertices.reduce((sum, v) => sum + v.position[i], 0) / vertexCount);
      const radii = shape.vertices.map(v => Math.hypot(...sub(v.position, center)));
      for (const radius of radii) close(radius, radii[0]);
      for (const face of shape.faces) {
        const diagonals = face.map((a, i) => Math.hypot(...sub(vertices.get(a), vertices.get(face[(i + 2) % face.length]))));
        for (const diagonal of diagonals) close(diagonal, diagonals[0]);
      }
    }
  });
}

for (const id of Object.keys(catalog)) {
  test(`${id}: three axis midplanes give finite nondegenerate sections without mutation`, async () => {
    const shape = (await load())[id];
    const before = JSON.stringify(shape);
    for (const axis of [0, 1, 2]) {
      const coordinates = shape.vertices.map(v => v.position[axis]);
      const midpoint = (Math.min(...coordinates) + Math.max(...coordinates)) / 2;
      const origin = [0, 0, 0];
      origin[axis] = midpoint;
      const first = [...origin], second = [...origin];
      first[(axis + 1) % 3] += 1;
      second[(axis + 2) % 3] += 1;
      const result = intersectPlane(shape, [origin, first, second]);
      assert.ok(result.points.length >= 3);
      assert.ok(Number.isFinite(result.area) && result.area > epsilon);
      assert.equal(new Set(result.points.map(p => JSON.stringify(p))).size, result.points.length);
      for (const p of result.points) {
        assert.ok(p.every(Number.isFinite));
        close(p[axis], midpoint);
      }
      let doubledArea = 0;
      for (let i = 0; i < result.points.length; i++) {
        doubledArea += dot(result.normal, cross(sub(result.points[i], origin), sub(result.points[(i + 1) % result.points.length], origin)));
      }
      close(doubledArea / 2, result.area);
    }
    assert.equal(JSON.stringify(shape), before);
  });

  test(`${id}: every edge supports canonical selectable midpoints`, async () => {
    const shape = (await load())[id];
    for (const [a, b] of shape.edges) {
      const token = edgePointId(shape, a, b);
      assert.equal(token, edgePointId(shape, b, a));
      const point = resolvePoint(shape, token);
      assert.ok(point);
      const start = shape.vertices.find(v => v.id === a).position;
      const end = shape.vertices.find(v => v.id === b).position;
      for (let i = 0; i < 3; i++) close(point.position[i], (start[i] + end[i]) / 2);
    }
  });
}

test('horizontal midsections have independent analytic areas', async () => {
  const shapes = await load();
  const pentagonArea = 5 * 1.1 ** 2 * Math.sin(2 * Math.PI / 5) / 2;
  const cases = [
    ['tetrahedron', 3, 3 * Math.sqrt(3) * 1.1 ** 2 / 16],
    ['obliqueprism', 3, 1.8 * 1.6 / 2],
    ['obliquecuboid', 4, 1.8 * 1.6],
    ['pentaprism', 5, pentagonArea],
    ['pentapyramid', 5, pentagonArea / 4],
    ['truncatedpyramid', 4, (1 + .5) ** 2],
  ];
  for (const [id, count, area] of cases) {
    const shape = shapes[id];
    const y = (-1 + Math.max(...shape.vertices.map(v => v.position[1]))) / 2;
    const section = intersectPlane(shape, [[0, y, 0], [1, y, 0], [0, y, 1]]);
    assert.equal(section.points.length, count, id);
    close(section.area, area);
  }
});

test('prisms have translated bases, regular pentagonal bases and genuinely oblique side edges', async () => {
  const shapes = await load();
  for (const id of ['obliqueprism', 'obliquecuboid', 'pentaprism']) {
    const shape = shapes[id];
    const count = shape.vertices.length / 2;
    const shift = sub(shape.vertices[count].position, shape.vertices[0].position);
    for (let i = 0; i < count; i++) {
      const current = sub(shape.vertices[i + count].position, shape.vertices[i].position);
      current.forEach((value, axis) => close(value, shift[axis]));
    }
    if (id !== 'pentaprism') assert.ok(Math.hypot(shift[0], shift[2]) > .1);
  }
  for (const id of ['pentaprism', 'pentapyramid']) {
    const base = shapes[id].vertices.slice(0, 5).map(v => v.position);
    const lengths = base.map((p, i) => Math.hypot(...sub(p, base[(i + 1) % 5])));
    lengths.forEach(length => close(length, lengths[0]));
    base.forEach(([x, y, z]) => { close(y, -1); close(Math.hypot(x, z), 1.1); });
  }
});
