import test from 'node:test';
import assert from 'node:assert/strict';
import { SHAPES, planeFromPoints } from '../src/geometry.js';
import { resolvePoint } from '../src/points.js';
import { intersectPlanes } from '../src/plane-intersection.js';
import { INTERSECTION_LESSONS, planesFromLesson, validateIntersectionAnswer } from '../src/intersection-lessons.js';

const dot = (a,b) => a.reduce((s,x,i) => s+x*b[i],0);

test('validator accepts every proved target and any canonical alternative pair on the actual line', () => {
  for (const lesson of INTERSECTION_LESSONS) assert.equal(validateIntersectionAnswer(lesson,lesson.target,lesson.relation).correct,true,lesson.id);
  const lesson = {...INTERSECTION_LESSONS[0],planes:[['A','B','C'],['A','B','A1']],target:['A','B']};
  for (const ids of [['B','A'],['A','edge:A:B:0.5'],['edge:A:B:0.25','edge:A:B:0.75']]) {
    const result = validateIntersectionAnswer(lesson,ids);
    assert.equal(result.correct,true); assert.match(result.message,/[А-Яа-я]/);
  }
  assert.equal(validateIntersectionAnswer({...lesson,target:['C','D'],relation:'parallel'},['A','B'],'intersecting').correct,true,'grade actual planes, not target or metadata');
});

test('validator rejects forged/noncanonical/nonedge references, duplicate positions, wrong and excess points', () => {
  const lesson = {...INTERSECTION_LESSONS[0],planes:[['A','B','C'],['A','B','A1']]};
  for (const ids of [null,{},[],['A'],['A','A'],['A','C'],['A','B','C'],['A','unknown'],['A',{id:'B',position:[1,-1,-1]}],['A','edge:B:A:0.5'],['A','edge:A:C:0.5'],['A','edge:A:B:0.50'],['A','edge:A:B:0'],['A','edge:A:B:NaN']]) {
    assert.equal(validateIntersectionAnswer(lesson,ids,'intersecting').correct,false,JSON.stringify(ids));
  }
  assert.equal(validateIntersectionAnswer(lesson,['A','B'],'parallel').correct,false);
  const prism = INTERSECTION_LESSONS.find(l => l.shapeId === 'prism');
  // Distinct canonical IDs whose points are closer than geometry tolerance cannot define a stable line.
  assert.equal(validateIntersectionAnswer(prism,['edge:A:A1:0.5','edge:A:A1:0.500000001'],'intersecting').correct,false);
});

test('parallel/coincident answers require explicit correct relation and zero points', () => {
  for (const lesson of INTERSECTION_LESSONS.filter(l => l.relation !== 'intersecting')) {
    for (const relation of [undefined,null,'', 'intersecting',lesson.relation === 'parallel' ? 'coincident' : 'parallel']) assert.equal(validateIntersectionAnswer(lesson,[],relation).correct,false);
    assert.equal(validateIntersectionAnswer(lesson,['A'],lesson.relation).correct,false);
    assert.equal(validateIntersectionAnswer(lesson,[],lesson.relation).correct,true);
  }
});

test('invalid lessons and invalid plane triples fail closed without throwing', () => {
  const base = INTERSECTION_LESSONS[0];
  for (const lesson of [null,{}, {...base,shapeId:'unknown'}, {...base,planes:[['A','A','A'],['A','B','C']]}, {...base,planes:[['A','B','forged'],['A','B','C']]}, {...base,planes:null}, {...base,type:'section'}]) {
    const result = validateIntersectionAnswer(lesson,[],'parallel');
    assert.equal(result.correct,false); assert.equal(typeof result.message,'string');
  }
  assert.throws(() => planesFromLesson(SHAPES.cube,[['A','B','C']]));
  assert.throws(() => planesFromLesson(SHAPES.cube,[['A','B','unknown'],['A','B','C']]));
});
test('eight self-contained Russian tasks prove their actual planes and target geometry', () => {
  assert.equal(INTERSECTION_LESSONS.length,8);
  assert.equal(new Set(INTERSECTION_LESSONS.map(l => l.id)).size,8);
  const lineShapes = [];
  for (const lesson of INTERSECTION_LESSONS) {
    assert.equal(lesson.type,'intersection'); assert.equal(lesson.planeCount,2);
    assert.ok(['intro','practice','challenge'].includes(lesson.level));
    for (const key of ['title','task','hint','explanation','kind']) assert.match(lesson[key],/[А-Яа-яЁё]/);
    assert.match(lesson.task,/плоскост/i);
    const shape = SHAPES[lesson.shapeId];
    const planes = lesson.planes.map(ids => {
      assert.equal(ids.length,3);
      for (const id of ids) {
        const ref = resolvePoint(shape,id); assert.ok(ref,id);
        if (ref.edge) assert.ok(lesson.task.includes(ref.edge.join('→')), `Missing midpoint definition ${id}`);
        else assert.ok(lesson.task.includes(id));
      }
      return planeFromPoints(...ids.map(id => resolvePoint(shape,id).position));
    });
    assert.deepEqual(planesFromLesson(shape,lesson.planes),planes);
    const intersection = intersectPlanes(...planes,shape);
    assert.equal(intersection.relation,lesson.relation);
    if (lesson.relation === 'intersecting') {
      lineShapes.push(lesson.shapeId); assert.equal(lesson.target.length,2);
      const points = lesson.target.map(id => resolvePoint(shape,id).position);
      assert.ok(Math.hypot(...points[0].map((x,i) => x-points[1][i])) > 1e-6);
      for (const p of points) for (const plane of planes) assert.ok(Math.abs(dot(plane.normal,p)+plane.constant) < 1e-8);
      assert.equal(intersection.segment.length,2);
    } else assert.deepEqual(lesson.target,[]);
  }
  assert.deepEqual(lineShapes.sort(),Object.keys(SHAPES).sort());
  assert.deepEqual(INTERSECTION_LESSONS.filter(l => l.relation !== 'intersecting').map(l => [l.shapeId,l.relation]).sort(),[['cube','coincident'],['cube','parallel']]);
});
