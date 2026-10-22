export const emptyProgress = () => ({ version: 1, solved: [], hints: [], revealed: [] });
export const STORAGE_KEY = 'sechenie.progress.v1';
export function recordSolve(progress, id, { revealed = false, correct = true } = {}) {
  if (revealed || progress.revealed?.includes(id) || !correct) return progress;
  return { ...progress, solved: [...new Set([...progress.solved, id])] };
}
export function recordReveal(progress, id) {
  return { ...progress, revealed: [...new Set([...(progress.revealed ?? []), id])] };
}
export function recordHint(progress, id) {
  return { ...progress, hints: [...new Set([...progress.hints, id])] };
}
export function saveProgress(storage, progress) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(progress)); return true; }
  catch { return false; }
}
export function loadProgress(storage, knownIds) {
  try {
    const data = JSON.parse(storage.getItem(STORAGE_KEY));
    if (!data || data.version !== 1) return emptyProgress();
    const clean = value => Array.isArray(value) ? [...new Set(value.filter(id => typeof id === 'string' && knownIds.includes(id)))] : [];
    return { version: 1, solved: clean(data.solved), hints: clean(data.hints), revealed: clean(data.revealed) };
  } catch { return emptyProgress(); }
}
