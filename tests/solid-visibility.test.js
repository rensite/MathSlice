import test from 'node:test';
import assert from 'node:assert/strict';
import { SHAPES } from '../src/geometry.js';
import { EXTRA_SHAPES } from '../src/extra-shapes.js';

const load = async () => (await import('../src/solid-visibility.js')).createSolidVisibility;

test('perspective cube hides only the rear corner and its three incident edges; orbit reverses it', async () => {
  const createSolidVisibility = await load();
  const classify = createSolidVisibility(SHAPES.cube).classify;
  const front = classify([4, 3, 5]);
  assert.deepEqual(front.vertices, { A: false, B: true, C: true, D: true, A1: true, B1: true, C1: true, D1: true });
  assert.deepEqual(front.edges, SHAPES.cube.edges.map(edge => !edge.includes('A')));
  const back = classify([-4, -3, -5]);
  assert.deepEqual(back.vertices, { A: true, B: true, C: true, D: true, A1: true, B1: true, C1: false, D1: true });
  assert.deepEqual(back.edges, SHAPES.cube.edges.map(edge => !edge.includes('C1')));
  assert.equal(front.vertices.A, false, 'previous classification is a snapshot');
});

test('boundary point visibility matches every vertex and canonical edge sample, not the interior', async () => {
  const createSolidVisibility = await load();
  for (const camera of [[4, 3, 5], [-4, -3, -5], [5, 0, 0], [1, 0, 5]]) {
    const result = createSolidVisibility(SHAPES.cube).classify(camera);
    for (const vertex of SHAPES.cube.vertices) {
      assert.equal(result.pointVisible(vertex.position), result.vertices[vertex.id]);
    }
    for (const [index, [a, b]] of SHAPES.cube.edges.entries()) {
      const from = SHAPES.cube.vertices.find(v => v.id === a).position;
      const to = SHAPES.cube.vertices.find(v => v.id === b).position;
      for (const t of [1 / 3, 0.5, 2 / 3]) {
        assert.equal(result.pointVisible(from.map((x, i) => x + t * (to[i] - x))), result.edges[index]);
      }
    }
    assert.equal(result.pointVisible([0, 0, 0]), false);
    assert.equal(result.pointVisible([0.999999, 0, 0]), false);
  }
  const front = createSolidVisibility(SHAPES.cube).classify([4, 3, 5]);
  assert.equal(front.pointVisible([1, 0, 0]), true);
  assert.equal(front.pointVisible([-1, 0, 0]), false);
});

test('silhouette faces remain visible at exact tangency and numerical roundoff', async () => {
  const createSolidVisibility = await load();
  const classify = createSolidVisibility(SHAPES.cube).classify;
  for (const x of [1, 1 - Number.EPSILON]) {
    const result = classify([x, 0, 5]);
    assert.deepEqual(result.vertices, { A: false, B: true, C: true, D: true, A1: false, B1: true, C1: true, D1: true });
    assert.equal(result.pointVisible([1, 0, -1]), true);
    assert.equal(result.pointVisible([0, 0, -1]), false);
    assert.equal(result.edges[9], true, 'BB1 belongs to the silhouette face');
  }
  const axial = classify([5, 0, 0]);
  assert.deepEqual(axial.vertices, { A: false, B: true, C: true, D: false, A1: false, B1: true, C1: true, D1: false });
  assert.deepEqual(axial.edges, SHAPES.cube.edges.map(edge => edge.every(id => ['B', 'C', 'B1', 'C1'].includes(id))));
});

test('camera validation rejects malformed, nonfinite, interior and body-boundary cameras', async () => {
  const createSolidVisibility = await load();
  const classify = createSolidVisibility(SHAPES.cube).classify;
  for (const camera of [undefined, null, {}, '4,3,5', [4, 3], [4, 3, 5, 0], [NaN, 3, 5], [4, Infinity, 5], ['4', 3, 5], Array(3)]) {
    assert.throws(() => classify(camera), TypeError);
  }
  for (const camera of [[0, 0, 0], [1, 0, 0], [1, 1, 1]]) assert.throws(() => classify(camera), RangeError);
  const result = classify([4, 3, 5]);
  for (const point of [null, [NaN, 0, 0], [0, 0], Array(3)]) assert.throws(() => result.pointVisible(point), TypeError);
});

const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

test('very distant finite perspective cameras do not turn rear faces into silhouettes', async () => {
  const createSolidVisibility = await load();
  const classify = createSolidVisibility(SHAPES.cube).classify;
  const axial = classify([5, 0, 0]);
  const diagonal = classify([4, 3, 5]);
  for (const distance of [1e16, Number.MAX_VALUE]) {
    const actual = classify([distance, 0, 0]);
    assert.deepEqual(actual.vertices, axial.vertices);
    assert.deepEqual(actual.edges, axial.edges);
    const distantDiagonal = classify([distance, distance, distance]);
    assert.deepEqual(distantDiagonal.vertices, diagonal.vertices);
    assert.deepEqual(distantDiagonal.edges, diagonal.edges);
  }
});

for (const shape of [...Object.values(SHAPES), ...Object.values(EXTRA_SHAPES)]) {
  test(`${shape.id}: finite classifications are winding/scale invariant with immutable inputs`, async () => {
    const createSolidVisibility = await load();
    const original = structuredClone(shape);
    const input = freeze(structuredClone(shape));
    const classify = createSolidVisibility(input).classify;
    const reversed = createSolidVisibility(freeze({ ...structuredClone(shape), faces: shape.faces.map(face => [...face].reverse()) })).classify;
    const mixed = createSolidVisibility(freeze({ ...structuredClone(shape), faces: shape.faces.map((face, i) => i % 2 ? [...face].reverse() : [...face]) })).classify;
    for (const coordinates of [[4, 3, 5], [-4, -3, -5], [6, 0, 0], [0, -6, 0], [0, 0, 6]]) {
      const camera = freeze([...coordinates]);
      const expected = classify(camera);
      assert.equal(Object.keys(expected.vertices).length, shape.vertices.length);
      assert.equal(expected.edges.length, shape.edges.length);
      assert.ok(Object.values(expected.vertices).every(value => typeof value === 'boolean'));
      assert.ok(expected.edges.every(value => typeof value === 'boolean'));
      assert.ok(expected.edges.some(Boolean), 'external camera has visible edges');
      for (const alternate of [reversed(camera), mixed(camera)]) {
        assert.deepEqual(alternate.vertices, expected.vertices);
        assert.deepEqual(alternate.edges, expected.edges);
      }
      for (const scale of [1e-12, 1, 1e12]) {
        const transform = p => p.map((x, i) => scale * (x + [7, -11, 13][i]));
        const scaled = freeze({ ...structuredClone(shape), vertices: shape.vertices.map(v => ({ ...v, position: transform(v.position) })) });
        const actual = createSolidVisibility(scaled).classify(freeze(transform(camera)));
        assert.deepEqual(actual.vertices, expected.vertices);
        assert.deepEqual(actual.edges, expected.edges);
        for (const vertex of shape.vertices) {
          assert.equal(actual.pointVisible(transform(vertex.position)), expected.vertices[vertex.id]);
        }
        for (const [index, [a, b]] of shape.edges.entries()) {
          const from = shape.vertices.find(v => v.id === a).position;
          const to = shape.vertices.find(v => v.id === b).position;
          const midpoint = from.map((x, i) => (x + to[i]) / 2);
          assert.equal(actual.pointVisible(transform(midpoint)), expected.edges[index]);
        }
        const centroid = [0, 1, 2].map(i => shape.vertices.reduce((sum, v) => sum + v.position[i] / shape.vertices.length, 0));
        assert.equal(actual.pointVisible(transform(centroid)), false);
      }
      assert.deepEqual(camera, coordinates);
    }
    assert.deepEqual(input, original);
  });
}
