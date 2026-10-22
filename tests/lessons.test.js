import test from 'node:test';
import assert from 'node:assert/strict';
import * as lessons from '../src/lessons.js';
import { SHAPES, intersectPlane, samePlane, planeFromPoints } from '../src/geometry.js';

// Independent analytic areas: rectangular products, triangle cross products,
// and (for the oblique hexagon) projected hexagon area / cos(plane tilt).
const analyticAreas = {
  cube: [4*Math.sqrt(2), 4, 4*Math.sqrt(2), 4*Math.sqrt(2), 2*Math.sqrt(3)],
  prism: [1.8, 2*Math.sqrt(4.24), Math.sqrt(7.24), Math.sqrt(7.48), Math.sqrt(7.48)],
  pyramid: [4, Math.sqrt(7.25), 2.5*Math.sqrt(2), Math.sqrt(7.25), 2.5*Math.sqrt(2)],
  cuboid: [4.5, 6, 7.5, 3*Math.sqrt(5), Math.sqrt(261)/4],
  hexprism: [3*Math.sqrt(3)/2, 2, 4, Math.sqrt(51)/4, Math.sqrt(63)/2],
  octahedron: [Math.sqrt(3)/2, 2, 2, Math.sqrt(3)/2, 2],
};

test('every course section has its independently calculated area', () => {
  for (const [shapeId,areas] of Object.entries(analyticAreas)) {
    const shape = SHAPES[shapeId];
    lessons.BASE_LESSONS.filter(l => l.shapeId === shapeId).forEach((lesson,i) => {
      const section = intersectPlane(shape, lesson.target.map(id => shape.vertices.find(v => v.id === id).position));
      assert.ok(Math.abs(section.area - areas[i]) < 1e-8, `${lesson.id}: ${section.area} != ${areas[i]}`);
    });
  }
});

test('all vertex triples of all lessons accept precisely coplanar answers, including alternatives', () => {
  for (const lesson of lessons.BASE_LESSONS) {
    const vertices = SHAPES[lesson.shapeId].vertices;
    const target = planeFromPoints(...lesson.target.map(id => vertices.find(v => v.id === id).position));
    let correct = 0, wrong = 0;
    for (let i=0;i<vertices.length;i++) for (let j=i+1;j<vertices.length;j++) for (let k=j+1;k<vertices.length;k++) {
      const triple = [vertices[i],vertices[j],vertices[k]];
      let noncollinear = true;
      try { planeFromPoints(...triple.map(v => v.position)); } catch { noncollinear = false; }
      const expected = noncollinear && triple.every(v => Math.abs(v.position.reduce((s,x,i) => s+x*target.normal[i], target.constant)) < 1e-8);
      for (const order of [triple,[...triple].reverse()]) {
        assert.equal(lessons.validateAnswer(lesson,order.map(v => v.id)).correct, expected, `${lesson.id}: ${order.map(v => v.id)}`);
      }
      if (expected) correct++; else wrong++;
    }
    assert.ok(correct > 0 && wrong > 0, lesson.id);
    if (lesson.sides > 3) assert.ok(correct > 1, `${lesson.id}: alternative coplanar triple`);
  }
});

test('oblique hexagon explanation names the actual edge midpoints, not selectable new vertices', () => {
  const shape = SHAPES.hexprism;
  const lesson = lessons.LESSONS.find(l => l.id === 'hexprism-oblique-hexagon');
  const point = id => shape.vertices.find(v => v.id === id).position;
  const midpoint = (a,b) => point(a).map((x,i) => (x+point(b)[i])/2);
  const section = intersectPlane(shape,lesson.target.map(point));
  const expected = [point('A'),point('B'),midpoint('C','C1'),point('D1'),point('E1'),midpoint('F','F1')];
  for (const p of expected) assert.ok(section.points.some(q => Math.hypot(...p.map((x,i) => x-q[i])) < 1e-8));
  const lengths = section.points.map((p,i,a) => Math.hypot(...p.map((x,j) => x-a[(i+1)%a.length][j])));
  assert.ok(lengths.some(l => Math.abs(l-lengths[0]) > 1e-8));
});

test('30 distinct vertex-plane lessons form six progressive five-lesson topics', () => {
  assert.equal(lessons.BASE_LESSONS.length, 30);
  assert.equal(new Set(lessons.BASE_LESSONS.map(l => l.id)).size, 30);
  assert.equal(lessons.LESSONS[0].id, 'cube-diagonal');
  assert.deepEqual([...new Set(lessons.LESSONS.map(l => l.shapeId))], Object.keys(SHAPES));
  const original = {
    'cube-diagonal': ['A','B','C1'], 'cube-vertical': ['A','C','A1'],
    'prism-diagonal': ['A','B','C1'], 'prism-face': ['A','C','A1'],
    'pyramid-ac': ['A','C','S'], 'pyramid-bd': ['B','D','S'],
  };
  for (const [id,target] of Object.entries(original)) assert.deepEqual(lessons.LESSONS.find(l => l.id === id)?.target, target);
  for (const shapeId of Object.keys(SHAPES)) {
    const matching = lessons.BASE_LESSONS.filter(l => l.shapeId === shapeId);
    assert.equal(matching.length, 5);
    assert.deepEqual(matching.map(l => l.level), ['intro','intro','practice','practice','challenge']);
    const planes = [];
    for (const lesson of matching) {
      assert.deepEqual(Object.keys(lesson).sort(), ['id','shapeId','title','task','target','sides','kind','hint','explanation','level'].sort());
      const shape = SHAPES[shapeId];
      assert.equal(lesson.target.length, 3);
      assert.equal(new Set(lesson.target).size, 3);
      const points = lesson.target.map(id => {
        const vertex = shape.vertices.find(v => v.id === id);
        assert.ok(vertex, `${lesson.id}: vertex ${id}`);
        return vertex.position;
      });
      assert.ok(planes.every(p => !samePlane(p, points, 1e-8)), `${lesson.id}: repeated plane`);
      planes.push(points);
      const result = intersectPlane(shape, points);
      assert.equal(result.points.length, lesson.sides, lesson.id);
      assert.ok(result.area > 0);
      assert.equal(lessons.validateAnswer(lesson, lesson.target).correct, true);
      for (const key of ['title','task','hint','explanation']) assert.ok(lesson[key].length > 20, `${lesson.id}: ${key}`);
      const edges = result.points.map((p,i,a) => p.map((x,j) => a[(i+1)%a.length][j] - x));
      const lengths = edges.map(e => Math.hypot(...e));
      const dot = (a,b) => a.reduce((s,x,i) => s + x*b[i],0);
      if (['Прямоугольник','Квадрат'].includes(lesson.kind)) {
        assert.equal(lesson.sides,4);
        edges.forEach((e,i) => assert.ok(Math.abs(dot(e,edges[(i+1)%4])) < 1e-8, lesson.id));
      }
      if (['Квадрат','Равносторонний треугольник','Правильный шестиугольник'].includes(lesson.kind)) {
        lengths.forEach(l => assert.ok(Math.abs(l-lengths[0]) < 1e-8, lesson.id));
      }
      if (lesson.kind.includes('треугольник') || lesson.kind === 'Треугольник') assert.equal(lesson.sides,3);
      if (lesson.kind === 'Шестиугольник' || lesson.kind === 'Правильный шестиугольник') assert.equal(lesson.sides,6);
      assert.ok(['Прямоугольник','Квадрат','Треугольник','Равносторонний треугольник','Шестиугольник','Правильный шестиугольник','Пятиугольник'].includes(lesson.kind));
    }
  }
});

test('validation compares entire planes, accepting reordered and alternative coplanar triples', () => {
  const lesson = lessons.LESSONS[0];
  assert.equal(lessons.validateAnswer(lesson, ['A','B','C1']).correct, true);
  assert.equal(lessons.validateAnswer(lesson, ['C1','B','A']).correct, true);
  assert.equal(lessons.validateAnswer(lesson, ['A','C1','D1']).correct, true);
  const wrong = lessons.validateAnswer(lesson, ['A','B','C']);
  assert.equal(wrong.correct, false);
  assert.ok(wrong.message.length > 20);
});

test('incomplete, repeated, unknown or malformed points return actionable failure without throwing', () => {
  for (const selected of [[],['A'],['A','B'],['A','A','B'],['A','B','missing'],['A','B','C','D'], null]) {
    const result = lessons.validateAnswer(lessons.LESSONS[0], selected);
    assert.equal(result.correct, false);
    assert.ok(result.message.length > 20);
  }
});
