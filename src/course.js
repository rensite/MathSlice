export const LEVELS = [
  { id: 'intro', label: 'Основы' },
  { id: 'practice', label: 'Практика' },
  { id: 'challenge', label: 'Вызов' },
];

export function courseSummary(lessons, progress) {
  const seen = new Set();
  lessons = lessons.filter(lesson => {
    if (seen.has(lesson.id)) return false;
    seen.add(lesson.id);
    return true;
  });
  const solvedIds = new Set(progress.solved);
  const revealedIds = new Set(progress.revealed ?? []);
  const isStudied = lesson => solvedIds.has(lesson.id) || revealedIds.has(lesson.id);
  const summarize = entries => {
    const total = entries.length;
    const solved = entries.filter(lesson => solvedIds.has(lesson.id)).length;
    const studied = entries.filter(isStudied).length;
    return { total, solved, studied, revealed: studied - solved, percent: total ? Math.round(solved / total * 100) : 0 };
  };
  const shapeIds = [...new Set(lessons.map(lesson => lesson.shapeId))];
  return {
    ...summarize(lessons),
    nextLessonId: lessons.find(lesson => !isStudied(lesson))?.id ?? null,
    byShape: shapeIds.map(shapeId => ({
      shapeId, ...summarize(lessons.filter(lesson => lesson.shapeId === shapeId)),
    })),
    byLevel: LEVELS.map(level => ({
      ...level, ...summarize(lessons.filter(lesson => lesson.level === level.id)),
    })),
  };
}
