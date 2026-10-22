import test from 'node:test';
import assert from 'node:assert/strict';
import { SHAPES, intersectPlane, samePlane } from '../src/geometry.js';

// Independent analytic fixtures: no expected values come from intersectPlane.
// A trihedral corner with orthogonal intercepts a,b,c has area
// sqrt((ab)^2 + (ac)^2 + (bc)^2)/2.
// The prism's corner uses AB=(2,0,0), AC=(1,0,1.8), AA1=(0,2,0):
// |(C-B) × (A1-B)|/2 = sqrt(187)/5; division by 3 scales area by 1/9.
const analytic = {
  'cube-edge-midpoints': { edges: [['A','B'],['A','D'],['A','A1']], t: [.5,.5,.5], sides: 3, kind: 'Равносторонний треугольник', area: Math.sqrt(3)/2, plane: [1,1,1,2] },
  'cube-edge-thirds': { edges: [['A','A1'],['B','B1'],['C','C1']], t: [1/3,1/3,1/3], sides: 4, kind: 'Квадрат', area: 4, plane: [0,1,0,1/3] },
  'prism-edge-midpoints': { edges: [['A','A1'],['B','B1'],['C','C1']], t: [.5,.5,.5], sides: 3, kind: 'Треугольник', area: 9/5, plane: [0,1,0,0] },
  'prism-edge-thirds': { edges: [['A','B'],['A','C'],['A','A1']], t: [1/3,1/3,1/3], sides: 3, kind: 'Треугольник', area: Math.sqrt(187)/45, plane: [1/2,1/2,5/18,8/9] },
  'pyramid-edge-midpoints': { edges: [['S','A'],['S','B'],['S','C']], t: [.5,.5,.5], sides: 4, kind: 'Квадрат', area: 1, plane: [0,1,0,-1/4] },
  'pyramid-edge-thirds': { edges: [['S','A'],['S','B'],['S','C']], t: [1/3,1/3,1/3], sides: 4, kind: 'Квадрат', area: 4/9, plane: [0,1,0,-2/3] },
  'cuboid-edge-midpoints': { edges: [['A','B'],['A','D'],['A','A1']], t: [.5,.5,.5], sides: 3, kind: 'Треугольник', area: Math.sqrt(261)/16, plane: [1/3,1/2,2/3,1] },
  'cuboid-edge-thirds': { edges: [['A','A1'],['B','B1'],['C','C1']], t: [1/3,1/3,1/3], sides: 4, kind: 'Прямоугольник', area: 9/2, plane: [0,1,0,1/3] },
  'hexprism-edge-midpoints': { edges: [['A','A1'],['B','B1'],['D','D1']], t: [.5,.5,.5], sides: 6, kind: 'Правильный шестиугольник', area: 3*Math.sqrt(3)/2, plane: [0,1,0,0] },
  // Affine graph y=-x/3-z/(3√3): projected regular hexagon area 3√3/2,
  // multiplied by sqrt(1+1/9+1/27), giving √31/2.
  'hexprism-edge-thirds': { edges: [['A','A1'],['B','B1'],['D','D1']], t: [1/3,1/3,2/3], sides: 6, kind: 'Шестиугольник', area: Math.sqrt(31)/2, plane: [1/3,1,1/(3*Math.sqrt(3)),0] },
  'octahedron-edge-midpoints': { edges: [['S','A'],['S','B'],['S','C']], t: [.5,.5,.5], sides: 4, kind: 'Квадрат', area: 1/2, plane: [0,1,0,-1/2] },
  'octahedron-edge-thirds': { edges: [['A','B'],['A','D'],['A','S']], t: [1/3,1/3,1/3], sides: 4, kind: 'Квадрат', area: 2/9, plane: [1,0,0,-2/3] },
};

const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-7, `${message}: ${actual} ≠ ${expected}`);

for (const [id, expected] of Object.entries(analytic)) {
  test(`${id}: interior edge targets, instructional copy and analytic section`, async () => {
    const { EDGE_LESSONS } = await import('../src/edge-lessons.js');
    const lesson = EDGE_LESSONS.find(item => item.id === id);
    assert.equal(lesson.pointMode, 'edges');
    const { edgePointId, resolvePoint } = await import('../src/points.js');
    const shape = SHAPES[lesson.shapeId];
    const midpoint = id.endsWith('midpoints');
    assert.ok((midpoint ? ['intro','practice'] : ['practice','challenge']).includes(lesson.level));
    for (const field of ['title','task','hint','explanation']) assert.ok(typeof lesson[field] === 'string' && lesson[field].length > 20, field);
    assert.ok(!/Выберите три вершины/i.test(lesson.task));
    assert.deepEqual(lesson.target, expected.edges.map(([a,b], i) => edgePointId(shape, a, b, expected.t[i])));
    assert.equal(new Set(lesson.target).size, 3);
    const positions = lesson.target.map((pointId, i) => {
      assert.equal(typeof pointId, 'string');
      const point = resolvePoint(shape, pointId);
      assert.ok(point && point.edge && point.t > 0 && point.t < 1, pointId);
      assert.ok(shape.edges.some(edge => edge.includes(point.edge[0]) && edge.includes(point.edge[1])));
      const [from,to] = expected.edges[i];
      const a = shape.vertices.find(v => v.id === from).position;
      const b = shape.vertices.find(v => v.id === to).position;
      point.position.forEach((x, axis) => near(x, a[axis] + expected.t[i]*(b[axis]-a[axis]), pointId));
      const [nx,ny,nz,d] = expected.plane;
      near(nx*point.position[0]+ny*point.position[1]+nz*point.position[2]+d, 0, `${id} analytic plane`);
      if (!midpoint) {
        // Direction is explicit: first endpoint → second endpoint, not canonical sorting.
        assert.ok(lesson.task.includes(`${from}→${to}`), 'task names directed edge');
        assert.ok(lesson.task.includes(expected.t[i] < .5 ? '1:2' : '2:1'));
      }
      return point.position;
    });
    const result = intersectPlane(shape, positions);
    assert.equal(lesson.sides, expected.sides);
    assert.equal(result.points.length, expected.sides);
    assert.equal(lesson.kind, expected.kind);
    near(result.area, expected.area, `${id} independent analytic area`);
    // Verify the claimed special type, not just its label or polygon count.
    const vectors = result.points.map((p,i) => result.points[(i+1)%result.points.length].map((x,k) => x-p[k]));
    const lengths = vectors.map(v => Math.hypot(...v));
    if (['Квадрат','Равносторонний треугольник','Правильный шестиугольник'].includes(lesson.kind)) {
      lengths.forEach(length => near(length, lengths[0], `${id} equal sides`));
    }
    if (['Квадрат','Прямоугольник'].includes(lesson.kind)) {
      vectors.forEach((v,i) => near(v.reduce((sum,x,k) => sum+x*vectors[(i+1)%vectors.length][k],0), 0, `${id} right angle`));
    }
  });
}

test('every new plane is distinct from its sibling and the original vertex-only course', async () => {
  const { EDGE_LESSONS } = await import('../src/edge-lessons.js');
  const { BASE_LESSONS } = await import('../src/lessons.js');
  const { resolvePoint } = await import('../src/points.js');
  const originals = BASE_LESSONS;
  assert.equal(originals.length, 30, 'the existing 30-lesson course remains intact');
  const allIds = [...originals, ...EDGE_LESSONS].map(lesson => lesson.id);
  assert.equal(new Set(allIds).size, 42, 'new IDs must not collide with existing saved progress IDs');
  for (const lesson of EDGE_LESSONS) {
    const shape = SHAPES[lesson.shapeId];
    const coordinates = target => target.map(id => resolvePoint(shape, id).position);
    for (const other of [...originals, ...EDGE_LESSONS]) {
      if (other.shapeId !== lesson.shapeId || other.id === lesson.id) continue;
      assert.equal(samePlane(coordinates(lesson.target), coordinates(other.target)), false, `${lesson.id} duplicates ${other.id}`);
    }
  }
});

// Dynamic loading lets the first RED report the absent catalog explicitly.
test('edge catalog supplies twelve distinct lessons, two for every solid', async () => {
  const module = await import('../src/edge-lessons.js').catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && error.message.includes('/src/edge-lessons.js')) return null;
    throw error;
  });
  assert.ok(module, 'The edge lesson catalog must exist');
  const { EDGE_LESSONS } = module;
  assert.equal(EDGE_LESSONS.length, 12);
  assert.equal(new Set(EDGE_LESSONS.map(lesson => lesson.id)).size, 12);
  for (const shapeId of ['cube', 'prism', 'pyramid', 'cuboid', 'hexprism', 'octahedron']) {
    assert.equal(EDGE_LESSONS.filter(lesson => lesson.shapeId === shapeId).length, 2);
  }
});
