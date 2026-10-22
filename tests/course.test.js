import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, courseSummary } from '../src/course.js';

test('levels expose the ordered Russian course metadata', () => {
  assert.deepEqual(LEVELS, [
    { id: 'intro', label: 'Основы' },
    { id: 'practice', label: 'Практика' },
    { id: 'challenge', label: 'Вызов' },
  ]);
});

const zeroCounts = { total: 0, solved: 0, studied: 0, revealed: 0, percent: 0 };
const lessons = [
  { id: 'cube-intro', shapeId: 'cube', level: 'intro' },
  { id: 'prism-intro', shapeId: 'prism', level: 'intro' },
  { id: 'cube-practice', shapeId: 'cube', level: 'practice' },
  { id: 'prism-challenge', shapeId: 'prism', level: 'challenge' },
  { id: 'cube-challenge', shapeId: 'cube', level: 'challenge' },
];

test('old v1 saves derive partial modules and levels without revealed field', () => {
  assert.deepEqual(courseSummary(lessons, {
    version: 1, solved: ['cube-intro', 'prism-challenge'], hints: ['cube-practice'],
  }), {
    total: 5, solved: 2, studied: 2, revealed: 0, percent: 40,
    nextLessonId: 'prism-intro',
    byShape: [
      { shapeId: 'cube', total: 3, solved: 1, studied: 1, revealed: 0, percent: 33 },
      { shapeId: 'prism', total: 2, solved: 1, studied: 1, revealed: 0, percent: 50 },
    ],
    byLevel: [
      { id: 'intro', label: 'Основы', total: 2, solved: 1, studied: 1, revealed: 0, percent: 50 },
      { id: 'practice', label: 'Практика', total: 1, solved: 0, studied: 0, revealed: 0, percent: 0 },
      { id: 'challenge', label: 'Вызов', total: 2, solved: 1, studied: 1, revealed: 0, percent: 50 },
    ],
  });
});

test('reveals study but never solve and do not erase previously earned solves', () => {
  const summary = courseSummary(lessons, {
    solved: ['cube-intro'], revealed: ['cube-intro', 'prism-intro'], hints: [],
  });
  assert.deepEqual(summary, {
    total: 5, solved: 1, studied: 2, revealed: 1, percent: 20,
    nextLessonId: 'cube-practice',
    byShape: [
      { shapeId: 'cube', total: 3, solved: 1, studied: 1, revealed: 0, percent: 33 },
      { shapeId: 'prism', total: 2, solved: 0, studied: 1, revealed: 1, percent: 0 },
    ],
    byLevel: [
      { id: 'intro', label: 'Основы', total: 2, solved: 1, studied: 2, revealed: 1, percent: 50 },
      { id: 'practice', label: 'Практика', total: 1, solved: 0, studied: 0, revealed: 0, percent: 0 },
      { id: 'challenge', label: 'Вызов', total: 2, solved: 0, studied: 0, revealed: 0, percent: 0 },
    ],
  });
});

test('duplicate lesson and progress IDs count once and unknown IDs are ignored', () => {
  const clean = { solved: ['cube-intro'], revealed: ['prism-intro'], hints: [] };
  assert.deepEqual(courseSummary([...lessons, { ...lessons[0] }, { ...lessons[1] }], {
    solved: ['ghost', 'cube-intro', 'cube-intro'],
    revealed: ['prism-intro', 'prism-intro', 'ghost', 'cube-intro'],
    hints: ['ghost'],
  }), courseSummary(lessons, clean));
});

test('all studied can honestly remain below 100 percent with no recommendation', () => {
  const summary = courseSummary(lessons, {
    solved: ['cube-intro'], revealed: lessons.map(lesson => lesson.id), hints: [],
  });
  assert.equal(summary.total, 5);
  assert.equal(summary.solved, 1);
  assert.equal(summary.studied, 5);
  assert.equal(summary.revealed, 4);
  assert.equal(summary.percent, 20);
  assert.equal(summary.nextLessonId, null);
});

test('recommendation follows course order independently of progress ID input order', () => {
  const progress = {
    solved: ['prism-challenge', 'cube-intro'],
    revealed: ['cube-challenge', 'prism-intro'],
  };
  const summary = courseSummary(lessons, progress);
  assert.equal(summary.nextLessonId, 'cube-practice');
  assert.deepEqual(courseSummary(lessons, {
    solved: [...progress.solved].reverse(), revealed: [...progress.revealed].reverse(),
  }), summary);
  assert.equal(courseSummary([...lessons].reverse(), { solved: [], revealed: [] }).nextLessonId,
    'cube-challenge');
});

test('all solved has 100 percent even after every answer is later revealed', () => {
  const ids = lessons.map(lesson => lesson.id);
  const summary = courseSummary(lessons, { solved: ids, revealed: ids });
  assert.equal(summary.solved, 5);
  assert.equal(summary.studied, 5);
  assert.equal(summary.revealed, 0);
  assert.equal(summary.percent, 100);
  assert.equal(summary.nextLessonId, null);
});

test('frozen inputs remain unchanged and returned objects do not alias inputs', () => {
  const frozenLessons = Object.freeze(lessons.map(lesson => Object.freeze({ ...lesson })));
  const progress = Object.freeze({
    version: 1,
    solved: Object.freeze(['cube-intro']),
    hints: Object.freeze(['cube-practice']),
    revealed: Object.freeze(['prism-intro']),
  });
  const before = JSON.stringify({ lessons: frozenLessons, progress, levels: LEVELS });
  const first = courseSummary(frozenLessons, progress);
  const second = courseSummary(frozenLessons, progress);
  first.byLevel[0].label = 'changed';
  first.byShape[0].solved = 99;
  first.byLevel.push({ id: 'extra' });
  assert.equal(JSON.stringify({ lessons: frozenLessons, progress, levels: LEVELS }), before);
  assert.deepEqual(courseSummary(frozenLessons, progress), second);
});

test('empty course has zero counts, all levels, and no recommendation', () => {
  assert.deepEqual(courseSummary([], { version: 1, solved: ['unknown'], hints: [] }), {
    ...zeroCounts,
    nextLessonId: null,
    byShape: [],
    byLevel: LEVELS.map(level => ({ ...level, ...zeroCounts })),
  });
});
