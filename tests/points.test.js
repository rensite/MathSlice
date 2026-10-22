import test from 'node:test';
import assert from 'node:assert/strict';
import { SHAPES } from '../src/geometry.js';

const load = () => import('../src/points.js');

test('percentage labels preserve fractional positions instead of rounding to a different point', async () => {
  const { edgePointId, resolvePoint } = await load();
  assert.equal(resolvePoint(SHAPES.cube,edgePointId(SHAPES.cube,'A','B',.375)).label,'AB·37.5%');
  assert.equal(resolvePoint(SHAPES.cube,edgePointId(SHAPES.cube,'A','B',.0125)).label,'AB·1.25%');
});

test('invalid solid vertex coordinates cannot produce nonfinite or malformed resolved points', async () => {
  const { edgePointId, resolvePoint } = await load();
  for (const position of [null, [], [1,2], [1,2,3,4], [NaN,0,0], [Infinity,0,0], ['1',0,0]]) {
    const shape = {vertices: [{id:'A',position}, {id:'B',position:[1,1,1]}], edges:[['A','B']]};
    assert.throws(() => edgePointId(shape,'A','B'), /finite 3D/);
    assert.equal(resolvePoint(shape,'A'),null);
    assert.equal(resolvePoint(shape,'edge:A:B:0.5'),null);
  }
});

test('resolvePoint rejects forged, reversed and noncanonical encodings consistently', async () => {
  const { resolvePoint } = await load();
  for (const id of [
    'edge:A:B:NaN', 'edge:A:B:Infinity', 'edge:A:B:-Infinity',
    'edge:A:B:-0.1', 'edge:A:B:1.1', 'edge:A:B:-0.0000000001', 'edge:A:B:1.0000000001',
    'edge:A:B:0', 'edge:A:B:-0', 'edge:A:B:1', 'edge:A:B:',
    'edge:A:B:.5', 'edge:A:B:0.50', 'edge:A:B:5e-1', 'edge:A:B:+0.5',
    'edge:A:B: 0.5', 'edge:A:B:0.5 ', 'edge:A:B:0x0', 'edge:A:B:0.1234567891',
    'edge:B:A:0.5', 'edge:B:A:0.333333333', 'edge:A:B:0.5:extra',
    'EDGE:A:B:0.5', 'edge::B:0.5', 'edge:A:Z:0.5', 'edge:__proto__:B:0.5',
    'edge:A:A:0.5', 'edge:A:C:0.5', 'point:0:0:0', '[0,0,0]',
  ]) assert.equal(resolvePoint(SHAPES.cube,id), null, id);
  for (const shape of Object.values(SHAPES)) {
    for (const from of shape.vertices.map(v => v.id)) {
      for (const to of shape.vertices.map(v => v.id)) {
        const adjacent = shape.edges.some(([a,b]) => a === from && b === to || a === to && b === from);
        if (!adjacent) assert.equal(resolvePoint(shape, `edge:${from}:${to}:0.5`), null);
      }
    }
  }
  const dangling = {vertices: [SHAPES.cube.vertices[0]], edges: [['A', 'B']]};
  assert.equal(resolvePoint(dangling, 'edge:A:B:0.5'), null);
});

test('all endpoints retain vertex identity across incident edges without mutating frozen solids', async () => {
  const { edgePointId, resolvePoint } = await load();
  const freeze = value => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  for (const original of Object.values(SHAPES)) {
    const shape = freeze(structuredClone(original));
    for (const [from,to] of shape.edges) {
      for (const [t,id] of [[0,from], [1,to]]) {
        assert.equal(edgePointId(shape,from,to,t), id);
        assert.deepEqual(resolvePoint(shape,edgePointId(shape,from,to,t)),resolvePoint(shape,id));
      }
      const id = edgePointId(shape, from, to, 0.37);
      const result = resolvePoint(shape,id);
      result.position[0] = 999;
      result.edge[0] = 'forged';
      assert.notEqual(resolvePoint(shape,id).position[0],999);
      assert.notEqual(resolvePoint(shape,id).edge[0],'forged');
      const vertex = resolvePoint(shape,from);
      vertex.position[0] = 999;
      assert.notEqual(resolvePoint(shape,from).position[0],999);
    }
    assert.deepEqual(shape,original);
  }
});

test('resolvePoint interpolates every edge midpoint and third with canonical metadata', async () => {
  const { edgePointId, resolvePoint } = await load();
  for (const shape of Object.values(SHAPES)) {
    for (const [from, to] of shape.edges) {
      const [a,b] = [from,to].sort();
      const start = shape.vertices.find(v => v.id === a).position;
      const end = shape.vertices.find(v => v.id === b).position;
      for (const [t, suffix] of [[0.5,'½'], [1/3,'⅓'], [2/3,'⅔'], [0.37,'37%'], [0.123456789,'12.3456789%']]) {
        const ratio = Number(t.toFixed(9));
        const id = edgePointId(shape, a, b, t);
        const result = resolvePoint(shape, id);
        assert.deepEqual(result, {
          id, label: `${(a+b).replaceAll('1', '₁')}·${suffix}`,
          position: start.map((x,i) => x + ratio*(end[i]-x)), edge: [a,b], t: ratio,
        });
        assert.deepEqual(resolvePoint(shape, edgePointId(shape,b,a,1-t)), result);
        assert.notEqual(result.position, resolvePoint(shape,id).position);
        assert.notEqual(result.edge, resolvePoint(shape,id).edge);
      }
    }
  }
});

test('resolvePoint preserves every vertex identity with fresh positions and subscript labels', async () => {
  const { resolvePoint } = await load();
  for (const shape of Object.values(SHAPES)) {
    for (const vertex of shape.vertices) {
      const result = resolvePoint(shape, vertex.id);
      assert.deepEqual(result, {id: vertex.id, label: vertex.id.replaceAll('1', '₁'), position: vertex.position, edge: null, t: null});
      assert.notEqual(result.position, vertex.position);
      assert.notEqual(result.position, resolvePoint(shape, vertex.id).position);
    }
  }
  for (const id of ['Z', '__proto__', 'constructor', '', null, undefined, {}, [], 1]) {
    assert.equal(resolvePoint(SHAPES.cube, id), null);
  }
  for (const shape of [null, undefined, {}, {vertices: null, edges: []}]) assert.equal(resolvePoint(shape, 'A'), null);
});

test('edgePointId rejects invalid endpoints, nonedges and invalid ratios before rounding', async () => {
  const { edgePointId } = await load();
  for (const t of [NaN, Infinity, -Infinity, -1e-12, 1+1e-12, -1, 2, null, '0.5', {}, [], true]) {
    assert.throws(() => edgePointId(SHAPES.cube, 'A', 'B', t), /finite number.*\[0, 1\]/);
  }
  for (const shape of Object.values(SHAPES)) {
    for (const from of shape.vertices.map(v => v.id)) {
      for (const to of shape.vertices.map(v => v.id)) {
        const adjacent = shape.edges.some(([a,b]) => a === from && b === to || a === to && b === from);
        if (!adjacent) assert.throws(() => edgePointId(shape, from, to), /edge/);
      }
    }
  }
  for (const [from, to] of [['A','Z'], ['Z','B'], ['__proto__','B'], ['A',null], [[], 'B'], ['A:B','B']]) {
    assert.throws(() => edgePointId(SHAPES.cube, from, to), /vertex|endpoint/);
  }
  for (const shape of [null, undefined, {}, {vertices: [], edges: []}, {vertices: SHAPES.cube.vertices, edges: [['A','Z']]}]) {
    assert.throws(() => edgePointId(shape, 'A', 'B'), Error);
  }
  const dangling = {vertices: [SHAPES.cube.vertices[0]], edges: [['A', 'B']]};
  assert.throws(() => edgePointId(dangling, 'A', 'B'), /vertex|endpoint/);
});

test('edgePointId normalizes reversed thirds, arbitrary ratios, precision and endpoints', async () => {
  const { edgePointId } = await load();
  for (const shape of Object.values(SHAPES)) {
    for (const [from, to] of shape.edges) {
      for (const t of [0, -0, 1, 0.5, 1/3, 2/3, 0.37, 0.12345678912, 1e-12, 1-1e-12]) {
        const [a, b] = [from, to].sort();
        const canonicalT = Number((from === a ? t : 1-t).toFixed(9)) || 0;
        const expected = canonicalT === 0 ? a : canonicalT === 1 ? b : `edge:${a}:${b}:${canonicalT}`;
        assert.equal(edgePointId(shape, from, to, t), expected);
        assert.equal(edgePointId(shape, to, from, 1-t), expected);
      }
    }
  }
});

test('edgePointId defaults to a lexical canonical midpoint on every solid edge', async () => {
  const { edgePointId } = await load();
  assert.equal(Object.keys(SHAPES).length, 6);
  for (const shape of Object.values(SHAPES)) {
    for (const [from, to] of shape.edges) {
      const [a, b] = [from, to].sort();
      assert.equal(edgePointId(shape, from, to), `edge:${a}:${b}:0.5`);
      assert.equal(edgePointId(shape, to, from), `edge:${a}:${b}:0.5`);
    }
  }
});
