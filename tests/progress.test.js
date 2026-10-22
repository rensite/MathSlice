import test from 'node:test';
import assert from 'node:assert/strict';
import * as progress from '../src/progress.js';

test('new progress is versioned and empty', () => {
  assert.deepEqual(progress.emptyProgress(), { version: 1, solved: [], hints: [], revealed: [] });
});

test('load rejects corruption and future versions, filters unknown and duplicate ids', () => {
  const store = value => ({ getItem: () => value });
  const ids = ['cube-diagonal', 'prism-diagonal'];
  for (const value of ['{bad', 'null', '[]', '{"version":2,"solved":["cube-diagonal"]}']) {
    assert.deepEqual(progress.loadProgress(store(value), ids), progress.emptyProgress());
  }
  assert.deepEqual(progress.loadProgress(store(JSON.stringify({version:1,solved:['cube-diagonal','cube-diagonal','foreign',4],hints:['prism-diagonal']})), ids), {version:1,solved:['cube-diagonal'],hints:['prism-diagonal'],revealed:[]});
  assert.deepEqual(progress.loadProgress({getItem(){throw Error('blocked');}}, ids), progress.emptyProgress());
});

test('revealing never awards a completion; valid solve deduplicates without mutation', () => {
  const original = progress.emptyProgress();
  assert.deepEqual(progress.recordSolve(original, 'cube-diagonal', {revealed:true}), original);
  assert.deepEqual(progress.recordSolve(original, 'cube-diagonal', {correct:false}), original);
  const solved = progress.recordSolve(original, 'cube-diagonal');
  assert.deepEqual(solved.solved, ['cube-diagonal']);
  assert.deepEqual(progress.recordSolve(solved, 'cube-diagonal').solved, ['cube-diagonal']);
  assert.deepEqual(original.solved, []);
});

test('reveals persist across reload without mutating or duplicating progress', () => {
  const original = progress.emptyProgress();
  const revealed = progress.recordReveal(original, 'cube-diagonal');
  assert.deepEqual(original.revealed, []);
  assert.deepEqual(revealed.revealed, ['cube-diagonal']);
  assert.deepEqual(revealed.solved, []);
  assert.deepEqual(progress.recordReveal(revealed, 'cube-diagonal').revealed, ['cube-diagonal']);
  let stored;
  const storage = { setItem(key, value) { stored = value; }, getItem() { return stored; } };
  assert.equal(progress.saveProgress(storage, revealed), true);
  assert.deepEqual(progress.loadProgress(storage, ['cube-diagonal']), revealed);
});

test('persisted reveals prevent completion after reload even when caller says unrevealed', () => {
  const ids = ['cube-diagonal', 'prism-diagonal'];
  let stored;
  const storage = { setItem(key, value) { stored = value; }, getItem() { return stored; } };
  progress.saveProgress(storage, progress.recordReveal(progress.emptyProgress(), ids[0]));
  const loaded = progress.loadProgress(storage, ids);
  assert.strictEqual(progress.recordSolve(loaded, ids[0], { correct: true, revealed: false }), loaded);
  assert.deepEqual(progress.recordSolve(loaded, ids[0]).solved, []);
  assert.deepEqual(progress.recordSolve(loaded, ids[1]).solved, [ids[1]]);
});

test('load sanitizes persisted reveals and tolerates malformed optional lists', () => {
  const ids = ['cube-diagonal', 'prism-diagonal'];
  const load = data => progress.loadProgress({ getItem: () => JSON.stringify({ version: 1, ...data }) }, ids);
  assert.deepEqual(load({ revealed: ['cube-diagonal', 'cube-diagonal', 'foreign', 4, null] }), {
    version: 1, solved: [], hints: [], revealed: ['cube-diagonal'],
  });
  for (const revealed of [null, {}, 'cube-diagonal', 4]) {
    assert.deepEqual(load({ solved: {}, hints: null, revealed }), progress.emptyProgress());
  }
});

test('reveal tracking accepts legacy v1 objects and preserves earned completions', () => {
  const legacy = { version: 1, solved: ['cube-diagonal'], hints: ['prism-diagonal'] };
  const revealed = progress.recordReveal(legacy, 'cube-diagonal');
  assert.deepEqual(revealed, { ...legacy, revealed: ['cube-diagonal'] });
  assert.deepEqual(legacy, { version: 1, solved: ['cube-diagonal'], hints: ['prism-diagonal'] });
  assert.deepEqual(progress.recordSolve(legacy, 'prism-diagonal').solved, ['cube-diagonal', 'prism-diagonal']);
  const loaded = progress.loadProgress({ getItem: () => JSON.stringify(revealed) }, ['cube-diagonal', 'prism-diagonal']);
  assert.deepEqual(loaded, revealed);
});

test('hint use is deduplicated and quota failure is explicit', () => {
  const initial = progress.emptyProgress();
  const hinted = progress.recordHint(initial, 'cube-diagonal');
  assert.deepEqual(progress.recordHint(hinted, 'cube-diagonal').hints, ['cube-diagonal']);
  assert.deepEqual(initial.hints, []);
  let stored;
  assert.equal(progress.saveProgress({setItem(key,value){stored=[key,JSON.parse(value)];}}, hinted), true);
  assert.deepEqual(stored, [progress.STORAGE_KEY, hinted]);
  assert.equal(progress.saveProgress({setItem(){throw Error('quota');}}, hinted), false);
});
