import test from 'node:test';
import assert from 'node:assert/strict';
import { SHAPES } from '../src/geometry.js';
import { edgePointId } from '../src/points.js';
import { LESSONS, validateAnswer } from '../src/lessons.js';

const shape = SHAPES.cube;
const point = (a,b,t=.5) => edgePointId(shape,a,b,t);
const lesson = {shapeId:'cube',target:[point('A','A1'),point('B','B1'),point('C','C1')]};

test('extended course appends twelve edge lessons while preserving the thirty original positions', () => {
  const original = LESSONS.slice(0,42);
  assert.equal(original.length,42);
  assert.equal(LESSONS.slice(0,30).every(item=>!item.pointMode),true);
  assert.equal(original.slice(30).every(item=>item.pointMode === 'edges'),true);
  assert.equal(new Set(original.map(item=>item.id)).size,42);
  for (const item of original) assert.equal(validateAnswer(item,item.target).correct,true,item.id);
});

test('single-plane and two-plane tasks coexist and dispatch validation without changing the original forty-two',()=>{
  assert.equal(LESSONS.length,50);
  assert.equal(LESSONS.slice(0,42).every(item=>item.type!=='intersection'),true);
  assert.equal(LESSONS.slice(42).every(item=>item.type==='intersection'&&item.planeCount===2),true);
  assert.equal(new Set(LESSONS.map(item=>item.id)).size,LESSONS.length);
  for(const item of LESSONS)assert.equal(validateAnswer(item,item.target,item.relation).correct,true,item.id);
});

test('answer validation accepts edge points and alternative points in the same full plane', () => {
  assert.equal(validateAnswer(lesson,lesson.target).correct,true);
  assert.equal(validateAnswer(lesson,[point('D','D1'),point('C','C1'),point('A','A1')]).correct,true);
  assert.equal(validateAnswer(lesson,[point('A','A1',1/3),point('B','B1',1/3),point('C','C1',1/3)]).correct,false);
});

test('edge validation rejects collinear, duplicate, forged and non-edge references', () => {
  for (const ids of [
    [point('A','B',.25),point('A','B',.5),point('A','B',.75)],
    [point('A','A1'),point('A','A1'),point('B','B1')],
    ['edge:A:C:0.5',point('A','A1'),point('B','B1')],
    ['edge:A:B:NaN',point('A','A1'),point('B','B1')],
  ]) {
    const result = validateAnswer(lesson,ids);
    assert.equal(result.correct,false);
    assert.ok(result.message.length > 20);
  }
});
