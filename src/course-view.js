const text = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function lessonRows({ lessons, progress, activeId, levels }) {
  return lessons.map(lesson => {
    const solved = progress.solved.includes(lesson.id);
    const reviewed = !solved && (progress.revealed || []).includes(lesson.id);
    const level = levels.find(item => item.id === lesson.level);
    const status = solved ? 'Решено' : reviewed ? 'Ответ разобран' : level?.label || '';
    const planeBadge = lesson.planeCount === 2 ? '<span class="plane-count-badge" data-plane-count="2">Две плоскости</span>' : '';
    return `<button data-action="lesson" data-lesson-id="${text(lesson.id)}" data-testid="lesson-${text(lesson.id)}" class="lesson-list-item ${activeId === lesson.id ? 'current' : ''}" aria-label="${text(lesson.title)}, ${text(status)}${lesson.planeCount===2?', две плоскости':''}"><span class="lesson-number ${solved ? 'done' : reviewed ? 'reviewed' : ''}" aria-hidden="true">${solved ? '✓' : reviewed ? '◌' : '·'}</span><span><strong>${text(lesson.title)}</strong><small><span class="level-badge" data-level="${text(lesson.level)}">${text(level?.label || '')}</span>${planeBadge}${solved || reviewed ? `<span class="lesson-status">${text(status)}</span>` : ''}</small></span><span aria-hidden="true">›</span></button>`;
  }).join('');
}

export function renderCourseLibrary({ lessons, shapes, progress, summary, levels, filter, expanded, activeId }) {
  const next = lessons.find(lesson => lesson.id === summary.nextLessonId);
  const overview = `<div class="course-overview"><p>${summary.total} заданий · ${summary.byShape.length} тем</p><span>Решено ${summary.solved} / ${summary.total}</span></div>`;
  const continuation = next ? `<button class="course-continue" data-action="continue-course"><span><small>${summary.studied ? 'Продолжить' : 'Начать курс'}</small><strong>${text(next.title)}</strong><span>${text(shapes[next.shapeId].name)} · ${text(levels.find(level => level.id === next.level)?.label || '')}</span></span><b aria-hidden="true">›</b></button>` : `<p class="course-finished">${summary.solved === summary.total ? 'Все задания решены самостоятельно.' : 'Все задания разобраны. Показанные ответы не засчитываются как самостоятельные решения.'}</p>`;
  const filters = `<div class="course-filters" role="group" aria-label="Сложность заданий">${[{id:'all',label:'Все'}, ...levels].map(level => `<button data-action="filter-level" data-level="${level.id}" aria-pressed="${filter === level.id}">${text(level.label)}</button>`).join('')}</div>`;
  const modules = summary.byShape.map(module => {
    const rows = lessons.filter(lesson => lesson.shapeId === module.shapeId && (filter === 'all' || lesson.level === filter));
    if (!rows.length) return '';
    return `<details class="course-module" data-course-shape="${module.shapeId}" ${expanded.has(module.shapeId) ? 'open' : ''}><summary><span class="course-module-name">${text(shapes[module.shapeId].name)}<small>${module.solved} / ${module.total} решено${module.revealed ? ` · ${module.revealed} разобрано` : ''}</small></span><span class="course-module-chevron" aria-hidden="true">⌄</span></summary><div class="course-module-track" aria-hidden="true"><i style="width:${module.percent}%"></i></div><div class="lesson-list">${lessonRows({lessons:rows,progress,activeId,levels})}</div></details>`;
  }).join('');
  return overview + continuation + filters + `<div class="course-modules">${modules}</div>`;
}

export function renderCourseProgress({ lessons, shapes, progress, summary, levels, activeId }) {
  const stats = `<div class="progress-summary"><strong>${summary.solved}<span> / ${summary.total}</span></strong><p>решено самостоятельно</p><div class="progress-track"><i style="width:${summary.percent}%"></i></div></div><div class="course-progress-facts"><span>Изучено <b>${summary.studied} / ${summary.total}</b></span><span>Разобрано без зачёта <b>${summary.revealed}</b></span></div>`;
  const levelRows = `<section class="level-progress" aria-label="Прогресс по сложности">${summary.byLevel.map(level => `<div><span>${text(level.label)}</span><b>${level.solved} / ${level.total}</b></div>`).join('')}</section>`;
  const modules = summary.byShape.map(module => `<section class="progress-module"><div class="progress-module-heading"><h3>${text(shapes[module.shapeId].name)}</h3><span>${module.solved} / ${module.total}</span></div><div class="progress-track"><i style="width:${module.percent}%"></i></div><details class="progress-module-lessons"><summary>Задания темы</summary><div class="lesson-list">${lessonRows({lessons:lessons.filter(lesson=>lesson.shapeId===module.shapeId),progress,activeId,levels})}</div></details></section>`).join('');
  return stats + `<div class="course-progress-body">${levelRows}${modules}</div>`;
}
