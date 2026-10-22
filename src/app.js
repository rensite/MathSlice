import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SHAPES as CORE_SHAPES, intersectPlane } from './geometry.js';
import { EXTRA_SHAPES } from './extra-shapes.js';
import { SURFACES, surfaceMesh, sliceSurface } from './surfaces.js';
import { createSurfaceModel, createSurfaceSection } from './surface-view.js';
import { createPlaneControls } from './plane-controls.js';
import { renderExtraCatalog } from './catalog-view.js';
import { LESSONS, validateAnswer } from './lessons.js';
import { createMobileHud } from './hud.js';
import { createSectionView } from './section-view.js';
import { intersectPlanes } from './plane-intersection.js';
import { createPlaneIntersectionView } from './intersection-view.js';
import { createSolidVisibility } from './solid-visibility.js';
import { createSolidEdges, updateSolidEdges } from './solid-view.js';
import { renderPlaneTools, renderIntersectionTask } from './plane-task-view.js';
import { resolvePoint } from './points.js';
import { createEdgeControls } from './edge-controls.js';
import { LEVELS, courseSummary } from './course.js';
import { renderCourseLibrary, renderCourseProgress } from './course-view.js';
import { emptyProgress, loadProgress, saveProgress, recordSolve, recordHint, recordReveal } from './progress.js';
import './style.css';
import './mobile.css';

const $ = selector => document.querySelector(selector);
const SHAPES = {...CORE_SHAPES,...EXTRA_SHAPES};
const text = value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const label = id => resolvePoint(SHAPES[shapeId],id)?.label || id.replace('1', '₁');
const shapeLabel = id => ({cube:'Куб',prism:'Призма',pyramid:'Пирамида',cuboid:'Брус',hexprism:'6-уг. призма',octahedron:'Октаэдр'})[id] || SHAPES[id].shortName || SHAPES[id].name;
const icons = {
  cube: '<path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z M3 7l9 5 9-5 M12 12v10 M7.5 4.5l9 5"/>',
  prism: '<path d="M3 18 11 4l10 14H3Z M3 18l3 4h16l-1-4 M11 4l3 4 8 14"/>',
  pyramid: '<path d="m12 2 10 16-10 4-10-4L12 2Zm0 0v20 M2 18l10-5 10 5"/>',
  cuboid: '<path d="m3 7 13-4 5 5v12L8 23l-5-5V7Zm0 0 5 5 13-4M8 12v11"/>',
  hexprism: '<path d="m7 3 10 0 5 6-5 6H7L2 9l5-6Zm-5 6v6l5 6h10l5-6V9M7 15v6m10-6v6"/>',
  octahedron: '<path d="m12 2 10 10-10 10L2 12 12 2Zm0 0v20M2 12l10-4 10 4-10 4-10-4Z"/>',
  undo: '<path d="m9 5-6 6 6 6 M3 11h11a7 7 0 0 1 7 7"/>',
  reset: '<path d="M20 7v5h-5 M20 12a8 8 0 1 0-2 6"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  book: '<path d="M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3V4Z M12 6v16"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  points: '<circle cx="6" cy="17" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="19" cy="16" r="2"/><path d="m7 15 4-7m3 0 4 6M8 17h9"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.cube}</svg>`;
let storage;
try { storage = window.localStorage; } catch { storage = null; }
let progress = storage ? loadProgress(storage, LESSONS.map(l => l.id)) : emptyProgress();
let storageFailed = !storage;
let mode = 'training', panel = 'exercise', lessonIndex = 0, shapeId = 'cube', selected = [];
let feedback = null, hintVisible = false, preview = null;
let surfaceId = null, surfaceData = null, surfaceSlice = null;
let labPlaneCount = 1, activePlane = 0, labPlanes = [[],[]], answerRelation = null;
let pairSlices = [], pairIntersection = null;
const intersectionTask = () => mode === 'training' && LESSONS[lessonIndex].type === 'intersection';
const selectionLimit = () => intersectionTask() ? 2 : 3;
const canCheck = () => intersectionTask() ? (answerRelation === 'parallel' || answerRelation === 'coincident' || (answerRelation === 'intersecting' && selected.length === 2)) : selected.length === 3;
let courseLevel = 'all';
const expandedShapes = new Set(['cube']);
const revealed = new Set(progress.revealed);
const visibility = { faces: true, grid: true, labels: true };
let renderer, scene, camera, controls, model, section, grid, observer, pointMarkers;
let edgePicking = false;
let projectedButtons = [], vertexMeshes = [], sceneWidth = 1, sceneHeight = 1, disposed = false;
let renderScene = () => {};
let classifySolid = null;

$('#app').innerHTML = `
  <a href="#workspace" class="skip-link">К построению</a>
  <header class="site-header">
    <a class="brand" href="./" aria-label="Сечение — на главную"><span class="brand-mark">${icon('cube')}</span><span><strong>Сечение<span class="brand-dot">.</span></strong><small>Лаборатория стереометрии</small></span></a>
    <nav class="main-nav" aria-label="Разделы лаборатории">
      <button data-action="training" data-testid="mode-training">Практика</button>
      <button data-action="lab" data-testid="mode-lab">Лаборатория</button>
      <button data-action="library">Курс <span class="nav-count">${LESSONS.length}</span></button>
    </nav>
    <button class="progress-link" data-action="progress" aria-label="Открыть мой прогресс"><span class="progress-ring" aria-hidden="true">✓</span><span data-testid="progress-count">0 / ${LESSONS.length}</span></button>
  </header>
  <main id="workspace" class="workspace">
    <div class="workspace-heading"><div><p class="breadcrumb" id="breadcrumb"></p><h1 id="workspace-title" tabindex="-1"></h1><p class="task-copy" id="task-copy"></p></div></div>
    <div class="workbench">
      <section class="drawing-column" aria-label="Интерактивное построение">
        <div class="board-frame">
          <div class="board-toolbar"><div class="shape-picker" aria-label="Выбор многогранника">${Object.keys(CORE_SHAPES).map(id => `<button data-action="shape" data-shape="${id}" data-testid="choose-shape-${id}" title="${SHAPES[id].name}" aria-label="${SHAPES[id].name}">${icon(id)}<span>${shapeLabel(id)}</span></button>`).join('')}${renderExtraCatalog(EXTRA_SHAPES,SURFACES)}</div><button class="icon-button" data-action="view" title="Исходный ракурс" aria-label="Вернуть исходный ракурс">${icon('reset')}</button></div>
          <div class="stage" data-testid="stage" aria-label="Трёхмерная модель. Вращайте перетаскиванием; выбирайте вершины кнопками." id="stage"><div class="stage-corner"><span class="stage-mark">3D</span><span id="solid-name">Куб</span></div><div id="canvas-host"></div><div class="vertex-overlay" id="vertex-overlay"></div><div class="axis-key" aria-hidden="true"><svg viewBox="0 0 70 62"><path d="M30 36 57 46M30 36 8 48M30 36V8"/><text x="59" y="51">x</text><text x="0" y="56">z</text><text x="26" y="8">y</text></svg></div><span class="orbit-help">Перетащите, чтобы повернуть</span></div>
          <div class="board-bottom"><span><i class="section-dot"></i> Секущая плоскость <em>α</em></span><span id="slice-info">Ожидает три точки</span></div>
        </div>
        <details class="drawing-settings"><summary>Настройки чертежа</summary><div class="view-tools" aria-label="Настройки чертежа"><label><input type="checkbox" data-toggle="faces" checked> Грани</label><label><input type="checkbox" data-toggle="grid" checked> Сетка</label><label><input type="checkbox" data-toggle="labels" checked> Обозначения</label></div></details>
        <section class="construction" aria-labelledby="construction-heading"><div class="construction-heading"><h2 id="construction-heading">Задайте плоскость</h2><div class="selection-actions"><button data-action="undo" class="text-button" id="undo-selection" aria-label="Отменить последнюю выбранную вершину">${icon('undo')} Отменить</button><button data-action="reset" data-testid="reset-selection" class="text-button">Сбросить</button></div></div><p class="construction-note">Выберите три точки: вершины или точки на рёбрах. Сечение появится автоматически.</p><div class="point-tools"><div id="vertex-buttons" class="vertex-buttons" aria-label="Вершины многогранника"></div><span class="selected-count" id="selected-count">0 из 3</span></div><div class="selection-line"><span>Плоскость <em>α</em></span><div id="selected-points" aria-live="polite"></div><span class="preview-note">Предпросмотр ≠ проверка</span></div></section>
      </section>
      <aside class="lesson-rail" id="lesson-rail" aria-label="Задание и объяснение"></aside>
    </div>
    <footer class="site-footer"><span>Сечения по трём точкам</span><span>Прогресс хранится на этом устройстве</span></footer>
  </main>
  <div class="mobile-hud" aria-label="Управление моделью">
    <div class="hud-top">
      <button class="hud-icon" data-action="menu-sheet" data-testid="hud-menu" aria-label="Открыть меню">${icon('menu')}</button>
      <button class="hud-task" data-action="task-sheet" data-testid="hud-task" aria-label="Открыть условие и решение" aria-describedby="hud-task-title hud-task-detail"><span id="hud-task-title"></span><small id="hud-task-detail"></small></button>
      <button class="hud-icon" data-action="view" aria-label="Исходный ракурс модели">${icon('reset')}</button>
    </div>
    <div class="hud-bottom">
      <button class="hud-points" data-action="points-sheet" data-testid="hud-points" aria-label="Выбрать точки" aria-describedby="hud-selection">${icon('points')}<span><span id="hud-points-title">Точки</span><strong id="hud-selection" aria-live="polite">0 / 3</strong></span></button>
      <button class="hud-icon" data-action="undo" data-testid="hud-undo" aria-label="Отменить точку">${icon('undo')}</button>
      <button class="hud-check" data-action="check" data-testid="hud-check" disabled>Проверить ${icon('arrow')}</button>
    </div>
  </div>
  <p class="hud-notice" id="hud-notice" role="status" hidden></p>
  <dialog class="mobile-sheet" id="mobile-sheet" aria-labelledby="sheet-title">
    <div class="sheet-header"><h2 id="sheet-title"></h2><button class="hud-icon" data-action="close-sheet" aria-label="Закрыть панель">${icon('close')}</button></div>
    <nav class="sheet-menu" id="sheet-menu" aria-label="Меню" hidden>
      <button data-action="mobile-training">Практика ${icon('arrow')}</button>
      <button data-action="mobile-library">Курс ${icon('book')}</button>
      <button data-action="mobile-lab">Лаборатория ${icon('cube')}</button>
      <button data-action="mobile-progress">Мой прогресс <span id="hud-progress">0 / ${LESSONS.length}</span></button>
      <button data-action="settings-sheet">Вид и фигура ${icon('eye')}</button>
    </nav>
    <div class="sheet-content" id="sheet-content"></div>
  </dialog>`;

const mobileHud = createMobileHud({ onClose: () => {
  if (panel !== 'exercise') { panel = 'exercise'; renderRail(); }
} });
const edgeControls = createEdgeControls({getShape:()=>SHAPES[shapeId],getSelected:()=>selected,getLimit:selectionLimit,onSelect:selectVertex,onPick:()=>{
  if (!scene) return;
  mobileHud.close(); edgePicking = true;
  mobileHud.notice('Коснитесь ребра. Положение можно будет уточнить.');
}});
const planeControls = createPlaneControls({onChange:()=>{ if (surfaceId) { updateSurfaceSelection(); updateHud(); } }});
const planeToolsRoot = document.createElement('div');
planeToolsRoot.className = 'plane-tools';
$('.construction-heading').after(planeToolsRoot);
const extraCatalog = $('#more-shapes');
function fitExtraCatalog() {
  if (extraCatalog.open) extraCatalog.style.setProperty('--catalog-top',`${Math.max(0,extraCatalog.getBoundingClientRect().bottom)}px`);
}
extraCatalog.addEventListener('toggle',fitExtraCatalog);
window.addEventListener('resize',()=>requestAnimationFrame(fitExtraCatalog));
window.addEventListener('scroll',fitExtraCatalog,{passive:true});

function updateHud() {
  mobileHud.update({mode, index:lessonIndex, total:LESSONS.length, shape:surfaceId ? (SURFACES[surfaceId].shortName || SURFACES[surfaceId].name) : shapeLabel(shapeId),
    target:LESSONS[lessonIndex].target.map(label), selected:selected.map(label), blocked:revealed.has(LESSONS[lessonIndex].id), solved:progress.solved.length, planeSummary:surfaceId ? planeControls.summary : null,
    limit:selectionLimit(),ready:canCheck(),
    targetSummary:intersectionTask() ? LESSONS[lessonIndex].planes.map((ids,i)=>`${i?'β':'α'}: ${ids.map(label).join(' · ')}`).join(' / ') : null,
    selectionSummary:intersectionTask() && answerRelation && answerRelation !== 'intersecting' ? (answerRelation === 'parallel' ? 'Параллельны' : 'Совпадают') : mode === 'lab' && labPlaneCount === 2 && !surfaceId ? `α: ${labPlanes[0].length}/3 · β: ${labPlanes[1].length}/3` : null});
}

function persist() {
  storageFailed = !storage || !saveProgress(storage, progress);
  updateProgress();
}
function updateProgress() {
  $('[data-testid="progress-count"]').textContent = `${progress.solved.length} / ${LESSONS.length}`;
  $('.progress-ring').style.setProperty('--progress', `${progress.solved.length / LESSONS.length * 100}%`);
  updateHud();
}
function courseViewProps() {
  return {lessons:LESSONS,shapes:SHAPES,progress,summary:courseSummary(LESSONS,progress),levels:LEVELS,
    filter:courseLevel,expanded:expandedShapes,activeId:mode === 'training' ? LESSONS[lessonIndex].id : null};
}
function openTaskSheet() {
  const title = panel === 'library' ? 'Базовый курс' : panel === 'progress' ? 'Мой прогресс' : mode === 'lab' ? 'Лаборатория' : 'Условие и решение';
  mobileHud.open('task', title);
}
function renderRail() {
  const focusedAction = $('#lesson-rail').contains(document.activeElement) ? document.activeElement.dataset.action : null;
  const focusedLevel = focusedAction === 'filter-level' ? document.activeElement.dataset.level : null;
  const l = LESSONS[lessonIndex];
  const isRevealed = revealed.has(l.id);
  const saved = progress.solved.includes(l.id);
  const revealNote = saved ? 'Самостоятельное решение уже засчитано и сохранено. Можно повторить разбор.' : 'Это знакомство с решением, не самостоятельное выполнение. Задание не засчитывается.';
  const storageNote = `<p class="storage-note">${storageFailed ? 'Сохранение недоступно. Прогресс останется только до закрытия страницы.' : 'Прогресс хранится только в этом браузере.'} Без аккаунта, Telegram и синхронизации с сервером.</p>`;
  let html;
  if (panel === 'library') {
    html = renderCourseLibrary(courseViewProps()) + storageNote;
  } else if (panel === 'progress') {
    html = renderCourseProgress(courseViewProps()) + storageNote;
  } else if (mode === 'lab' && surfaceId) {
    const definition = SURFACES[surfaceId];
    html = `<div class="rail-kicker">Свободное исследование</div><h2>${text(definition.name)}</h2><p class="rail-intro">${text(definition.description)}</p><p class="surface-equation">${text(definition.equation)}</p><div class="concept-note"><p>Меняйте наклон, поворот и смещение секущей плоскости. Вращайте саму модель отдельно.</p></div><p class="scope-note">${definition.closed ? 'Контуры и площади приближённые: вычислены по полигональной модели.' : 'Показан ограниченный фрагмент поверхности, а не замкнутое тело. Контуры могут обрываться на границе фрагмента.'} Исследование не добавляет зачёт курса.</p><button data-action="training" class="primary-button">Вернуться к практике ${icon('arrow')}</button>`;
  } else if (intersectionTask()) {
    html = renderIntersectionTask({lesson:l,label,index:lessonIndex,total:LESSONS.length,ready:canCheck(),feedback,isRevealed,saved,hintVisible}) + storageNote;
  } else if (mode === 'lab') {
    html = `<div class="rail-kicker"><span class="tiny-dot"></span> Свободная лаборатория</div><h2>А если провести<br>плоскость иначе?</h2><p class="rail-intro">Выберите многогранник и три точки: вершины или точки на рёбрах. Исследуйте, как меняется его сечение.</p><div class="instruction"><span>1</span><p>Вращайте фигуру, чтобы увидеть скрытые рёбра.</p></div><div class="instruction"><span>2</span><p>Отметьте вершины или откройте «Точки на рёбрах». Повторное нажатие убирает точку.</p></div><div class="instruction"><span>3</span><p>Сравните сечение с гранями. Все длины — в условных единицах.</p></div><div class="concept-note"><em>Три точки — одна плоскость.</em><p>Если точки не лежат на одной прямой, через них проходит ровно одна плоскость.</p></div><button data-action="training" class="primary-button">Перейти к практике ${icon('arrow')}</button><p class="scope-note">Доступны середины рёбер, деление 1:2 и произвольное положение в процентах. Пошаговые доказательства пока не проверяются.</p>`;
  } else {
    html = `<div class="rail-kicker"><span class="tiny-dot"></span> Задание ${String(lessonIndex+1).padStart(2,'0')} <span class="kicker-end">из ${LESSONS.length} ${saved ? '· Решено ✓' : ''}</span></div><h2>${l.title}</h2><p class="rail-intro">${l.task}</p><div class="task-given"><span>Дано</span><div>${l.target.map(id => `<b>${label(id)}</b>`).join('<span class="point-separator">,</span>')}</div><span>Найти сечение</span></div><div class="task-step"><span class="step-number">1</span><div><strong>Отметьте три точки</strong><p>Порядок выбора не важен. Проверяется плоскость, а не последовательность.</p></div></div><button class="primary-button" data-action="check" data-testid="check-answer" ${selected.length !== 3 || isRevealed ? 'disabled' : ''}>Проверить построение ${icon('arrow')}</button><p class="check-note">Сечение на чертеже — пока только предпросмотр.</p>${feedback ? `<div class="feedback ${feedback.correct ? 'success' : 'try-again'}" role="status"><strong>${feedback.correct ? 'Плоскость найдена' : 'Попробуйте ещё раз'}</strong><p>${feedback.message}</p></div>` : ''}${isRevealed ? '<div class="feedback revealed" role="status"><strong>Ответ показан</strong><p>' + revealNote + '</p></div>' : ''}<div class="help-tools"><button class="text-button" data-action="hint" data-testid="show-hint">${hintVisible ? 'Скрыть подсказку' : 'Нужна подсказка?'}</button><button class="text-button reveal-button" data-action="reveal" data-testid="reveal-answer">Показать ответ</button></div>${hintVisible ? `<div class="hint-box"><strong>Небольшая подсказка</strong><p>${l.hint}</p></div>` : ''}${isRevealed || feedback?.correct ? `<div class="explanation"><span class="rail-kicker">Разберём геометрию</span><h3>${l.kind}</h3><p>${l.explanation}</p></div><button class="next-button" data-action="next" data-testid="next-lesson">${lessonIndex === LESSONS.length-1 ? 'К результатам' : 'Следующее задание'} ${icon('arrow')}</button>` : ''}<div class="lesson-pagination" aria-label="Переход к заданию">${LESSONS.map((item,i) => `<button data-action="lesson" data-index="${i}" data-testid="lesson-${item.id}" aria-label="Задание ${i+1}: ${item.title}" aria-current="${i === lessonIndex ? 'step' : 'false'}" class="${progress.solved.includes(item.id) ? 'done' : ''}">${progress.solved.includes(item.id) ? '✓' : String(i+1).padStart(2,'0')}</button>`).join('')}</div>${storageNote}`;
  }
  $('#lesson-rail').innerHTML = html;
  $('[data-action="training"]').setAttribute('aria-current', mode === 'training' && panel === 'exercise' ? 'page' : 'false');
  $('[data-action="lab"]').setAttribute('aria-current', mode === 'lab' && panel === 'exercise' ? 'page' : 'false');
  $('[data-action="library"]').setAttribute('aria-current', panel === 'library' ? 'page' : 'false');
  $('#workspace').dataset.mode = mode;
  $('#workspace').dataset.panel = panel;
  $('.workspace-heading').dataset.panel = panel;
  $('#breadcrumb').textContent = panel === 'exercise' ? (mode === 'training' ? `Задание ${lessonIndex + 1} из ${LESSONS.length} · ${LEVELS.find(level => level.id === l.level)?.label || ''} · ${SHAPES[shapeId].name}` : 'Свободное построение') : 'Практика';
  $('#workspace-title').textContent = panel === 'library' ? 'Базовый курс' : panel === 'progress' ? 'Мой прогресс' : mode === 'training' ? l.title : 'Лаборатория';
  $('#task-copy').textContent = panel !== 'exercise' ? '' : mode === 'training' ? l.task : surfaceId ? SURFACES[surfaceId].description : 'Выберите фигуру и три точки: вершины или точки на рёбрах. Вращайте модель, чтобы рассмотреть сечение.';
  updateHud();
  if (focusedAction) {
    const result = ['check', 'reveal'].includes(focusedAction) ? $('#lesson-rail .feedback') : null;
    if (result) result.tabIndex = -1;
    const levelSelector = focusedLevel ? `[data-level="${focusedLevel}"]` : '';
    const target = result || $(`#lesson-rail [data-action="${focusedAction}"]${levelSelector}:not(:disabled)`) || $('#workspace-title');
    target.focus({preventScroll:true});
  }
}
function updateSelection() {
  mobileHud.notice('');
  if (surfaceId) { renderSection(); renderRail(); return; }
  if (mode === 'lab' && labPlaneCount === 2) labPlanes[activePlane] = [...selected];
  const dual = intersectionTask() || (mode === 'lab' && labPlaneCount === 2);
  const planePoints = intersectionTask() ? LESSONS[lessonIndex].planes : labPlanes;
  pairSlices = dual ? planePoints.map(ids=>{
    try { return ids.length === 3 ? intersectPlane(SHAPES[shapeId],ids.map(id=>resolvePoint(SHAPES[shapeId],id).position)) : null; } catch { return null; }
  }) : [];
  pairIntersection = pairSlices.length === 2 && pairSlices.every(Boolean) ? intersectPlanes(pairSlices[0],pairSlices[1],SHAPES[shapeId]) : null;
  planeToolsRoot.innerHTML = renderPlaneTools({lab:mode === 'lab',planeCount:labPlaneCount,activePlane,intersectionTask:intersectionTask(),answerRelation});
  planeToolsRoot.hidden = !planeToolsRoot.innerHTML;
  $('#construction-heading').textContent = intersectionTask() ? 'Найдите пересечение' : dual ? `Задайте плоскость ${activePlane?'β':'α'}` : 'Задайте плоскость';
  $('.construction-note').textContent = intersectionTask() ? 'Две различные точки общей прямой или взаимное положение плоскостей.' : 'Выберите три точки: вершины или точки на рёбрах. Сечение появится автоматически.';
  const classification = intersectionTask() && ['parallel','coincident'].includes(answerRelation);
  $('.point-tools').hidden = $('.selection-line').hidden = $('.edge-point-tools').hidden = classification;
  $('.selection-line > span').textContent = intersectionTask() ? 'Общая прямая' : `Плоскость ${dual && activePlane?'β':'α'}`;
  $('.board-bottom > span').textContent = dual ? 'Плоскости α и β' : 'Секущая плоскость α';
  $('#stage').dataset.activePlane = dual && activePlane ? 'beta' : 'alpha';
  preview = null;
  if (!intersectionTask() && selected.length === 3) {
    try { preview = intersectPlane(SHAPES[shapeId], selected.map(id => resolvePoint(SHAPES[shapeId],id).position)); }
    catch { /* A degenerate plane is reported below. */ }
  }
  $('#selected-count').textContent = `${selected.length} из ${selectionLimit()}`;
  $('#selected-points').innerHTML = Array.from({length:selectionLimit()}, (_,i) => `<span class="point-slot ${selected[i] ? 'filled' : ''}">${selected[i] ? label(selected[i]) : '·'}</span>`).join('');
  $('#undo-selection').disabled = selected.length === 0;
  $('[data-action="reset"]').disabled = selected.length === 0;
  $('#slice-info').textContent = preview ? `${preview.points.length} ${preview.points.length >= 5 ? 'сторон' : 'стороны'} · S = ${preview.area.toLocaleString('ru-RU', {maximumFractionDigits:2})}` : selected.length === 3 ? 'Эти точки не задают плоскость' : `Выбрано ${selected.length} из 3 точек`;
  if (dual) $('#slice-info').textContent = intersectionTask() && !feedback?.correct && !revealed.has(LESSONS[lessonIndex].id) ? 'Даны α и β · ответ ещё не проверен' : !pairIntersection ? 'Задайте по три неколлинеарные точки для α и β' : pairIntersection.relation === 'parallel' ? 'Плоскости параллельны' : pairIntersection.relation === 'coincident' ? 'Плоскости совпадают' : pairIntersection.segment.length === 2 ? 'Пересекаются · общая прямая и её отрезок в фигуре' : pairIntersection.segment.length === 1 ? 'Пересекаются · касание фигуры в точке' : 'Пересекаются · прямая вне фигуры';
  document.querySelectorAll('[data-vertex]').forEach(button => {
    const active = selected.includes(button.dataset.vertex);
    button.setAttribute('aria-pressed', String(active));
    button.classList.toggle('selected', active);
  });
  renderSection();
  edgeControls.refresh();
  renderRail();
}
function selectVertex(id) {
  if (surfaceId) return;
  if (!resolvePoint(SHAPES[shapeId],id)) return;
  if (selected.includes(id)) selected = selected.filter(item => item !== id);
  else if (selected.length < selectionLimit()) selected.push(id);
  else {
    if (!mobileHud.active) $('#slice-info').textContent = 'Сначала уберите одну из трёх точек';
    mobileHud.notice(intersectionTask() ? 'Уберите одну из двух точек' : 'Уберите одну из трёх точек');
    return;
  }
  feedback = null;
  if (intersectionTask()) answerRelation = 'intersecting';
  updateSelection();
}
function changeShape(id) {
  if (!SHAPES[id]) return;
  surfaceId = surfaceData = surfaceSlice = null;
  $('.construction').hidden = false; $('#surface-controls').hidden = true;
  $('#vertex-overlay').hidden = !visibility.labels || !scene;
  shapeId = id;
  labPlaneCount = 1; activePlane = 0; labPlanes = [[],[]]; answerRelation = null;
  edgePicking = false;
  selected = []; feedback = null; preview = null;
  $('#solid-name').textContent = SHAPES[id].name;
  document.querySelectorAll('[data-shape]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.shape === id)));
  document.querySelectorAll('[data-surface]').forEach(button=>button.setAttribute('aria-pressed','false'));
  $('#vertex-buttons').innerHTML = SHAPES[id].vertices.map(v => `<button class="vertex-button" data-vertex="${v.id}" data-testid="vertex-${v.id}" aria-label="Вершина ${label(v.id)}" aria-pressed="false">${label(v.id)}</button>`).join('');
  $('#vertex-overlay').innerHTML = SHAPES[id].vertices.map(v => `<button class="vertex-label" data-vertex="${v.id}" aria-label="Выбрать вершину ${label(v.id)} на модели" aria-pressed="false">${label(v.id)}</button>`).join('');
  projectedButtons = [...$('#vertex-overlay').children];
  edgeControls.reset({open:mode === 'training' && LESSONS[lessonIndex].pointMode === 'edges'});
  $('[data-action="pick-edge"]').disabled = !scene;
  buildModel();
  updateSelection();
}
function openLesson(index) {
  mobileHud.close();
  lessonIndex = index; mode = 'training'; panel = 'exercise'; hintVisible = false; feedback = null;
  expandedShapes.add(LESSONS[index].shapeId);
  changeShape(LESSONS[index].shapeId);
  (mobileHud.active ? $('[data-testid="hud-task"]') : $('#workspace-title')).focus({preventScroll:true});
  window.scrollTo({top:0,behavior:'instant'});
}
function changeSurface(id) {
  if (!SURFACES[id]) return;
  mobileHud.close(); $('#more-shapes').open = false;
  mode = 'lab'; panel = 'exercise'; surfaceId = id;
  selected = []; feedback = preview = null; edgePicking = false;
  surfaceData = surfaceMesh(id);
  const initialOffset = id === 'hyperboloid2' ? 1.3 : ['ellipticparaboloid','paraboliccylinder'].includes(id) ? .5 : 0;
  planeControls.reset(surfaceData.bounds,SURFACES[id],initialOffset);
  $('.construction').hidden = true; $('#surface-controls').hidden = false;
  $('#vertex-overlay').replaceChildren(); $('#vertex-overlay').hidden = true;
  projectedButtons = []; vertexMeshes = [];
  disposeGroup(pointMarkers); pointMarkers = null;
  $('#solid-name').textContent = SURFACES[id].name;
  document.querySelectorAll('[data-shape]').forEach(button=>button.setAttribute('aria-pressed','false'));
  document.querySelectorAll('[data-surface]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.surface===id)));
  buildModel(); updateSelection();
}

document.addEventListener('click', event => {
  const vertex = event.target.closest('[data-vertex]');
  if (vertex) {
    // Model pointer taps are handled on the stage; keyboard/assistive clicks still activate labels.
    if (vertex.classList.contains('vertex-label') && event.detail > 0) return;
    selectVertex(vertex.dataset.vertex); return;
  }
  const button = event.target.closest('button[data-action]');
  if (!button || button.disabled) return;
  switch (button.dataset.action) {
    case 'menu-sheet': edgePicking = false; mobileHud.notice(''); mobileHud.open('menu'); break;
    case 'task-sheet': edgePicking = false; panel = 'exercise'; renderRail(); openTaskSheet(); break;
    case 'points-sheet': edgePicking = false; mobileHud.notice(''); mobileHud.open('points',surfaceId ? 'Секущая плоскость' : undefined); break;
    case 'settings-sheet': mobileHud.open('settings'); break;
    case 'close-sheet': mobileHud.close(); break;
    case 'mobile-training': openLesson(lessonIndex); break;
    case 'mobile-lab': mobileHud.close(); mode = 'lab'; panel = 'exercise'; changeShape(shapeId); break;
    case 'mobile-library': panel = 'library'; renderRail(); openTaskSheet(); break;
    case 'mobile-progress': panel = 'progress'; renderRail(); openTaskSheet(); break;
    case 'training': openLesson(lessonIndex); break;
    case 'lab': mode = 'lab'; panel = 'exercise'; changeShape(shapeId); break;
    case 'library': panel = 'library'; renderRail(); $('#workspace-title').focus(); break;
    case 'progress': panel = 'progress'; renderRail(); $('#workspace-title').focus(); break;
    case 'lesson': {
      const index = button.dataset.lessonId ? LESSONS.findIndex(lesson => lesson.id === button.dataset.lessonId) : Number(button.dataset.index);
      if (Number.isInteger(index) && index >= 0 && index < LESSONS.length) openLesson(index);
      break;
    }
    case 'filter-level':
      if (button.dataset.level === 'all' || LEVELS.some(level => level.id === button.dataset.level)) { courseLevel = button.dataset.level; renderRail(); }
      break;
    case 'continue-course': {
      const nextId = courseSummary(LESSONS,progress).nextLessonId;
      const index = LESSONS.findIndex(lesson => lesson.id === nextId);
      if (index >= 0) openLesson(index);
      break;
    }
    case 'shape':
      if (mode === 'training') { openLesson(LESSONS.findIndex(l => l.shapeId === button.dataset.shape)); }
      else changeShape(button.dataset.shape);
      break;
    case 'extra-shape':
      mobileHud.close(); $('#more-shapes').open = false;
      mode = 'lab'; panel = 'exercise'; changeShape(button.dataset.shape);
      break;
    case 'surface': changeSurface(button.dataset.surface); break;
    case 'plane-count': {
      if (mode !== 'lab' || surfaceId) break;
      const count = Number(button.dataset.count);
      if (count === 2) { labPlanes = [[...selected],[]]; labPlaneCount = 2; activePlane = 1; selected = []; }
      else if (count === 1) { selected = [...labPlanes[0]]; labPlaneCount = 1; activePlane = 0; labPlanes = [[],[]]; }
      updateSelection();
      planeToolsRoot.querySelector(count === 2 ? '[data-plane="1"]' : '[data-count="2"]')?.focus({preventScroll:true});
      break;
    }
    case 'active-plane':
      if (mode !== 'lab' || labPlaneCount !== 2 || !['0','1'].includes(button.dataset.plane)) break;
      activePlane = Number(button.dataset.plane); selected = [...labPlanes[activePlane]]; updateSelection();
      planeToolsRoot.querySelector(`[data-plane="${activePlane}"]`)?.focus({preventScroll:true});
      break;
    case 'answer-relation':
      if (!intersectionTask() || !['intersecting','parallel','coincident'].includes(button.dataset.relation)) break;
      answerRelation = button.dataset.relation; selected = []; feedback = null; updateSelection();
      planeToolsRoot.querySelector(`[data-relation="${answerRelation}"]`)?.focus({preventScroll:true});
      break;
    case 'reset': selected = []; feedback = null; updateSelection(); break;
    case 'undo': selected.pop(); feedback = null; updateSelection(); break;
    case 'view': resetView(); break;
    case 'hint':
      hintVisible = !hintVisible;
      if (hintVisible) { progress = recordHint(progress, LESSONS[lessonIndex].id); persist(); }
      renderRail(); break;
    case 'reveal':
      revealed.add(LESSONS[lessonIndex].id);
      progress = recordReveal(progress, LESSONS[lessonIndex].id); persist();
      selected = [...LESSONS[lessonIndex].target]; answerRelation = LESSONS[lessonIndex].relation || null; feedback = null; updateSelection(); break;
    case 'check': {
      const lesson = LESSONS[lessonIndex];
      feedback = validateAnswer(lesson, selected, answerRelation);
      progress = recordSolve(progress, lesson.id, {correct: feedback.correct, revealed: revealed.has(lesson.id)});
      persist(); updateSelection();
      if (mobileHud.active) openTaskSheet();
      const result = $('.feedback');
      if (result) { result.tabIndex = -1; result.focus({preventScroll:true}); result.scrollIntoView({block:'nearest'}); }
      break;
    }
    case 'next':
      if (lessonIndex === LESSONS.length - 1) { panel = 'progress'; renderRail(); if (mobileHud.active) openTaskSheet(); }
      else openLesson(lessonIndex+1);
      break;
  }
});
document.addEventListener('toggle', event => {
  const module = event.target;
  if (!module.isConnected || !module.matches('.course-module')) return;
  if (module.open) expandedShapes.add(module.dataset.courseShape);
  else expandedShapes.delete(module.dataset.courseShape);
}, true);
document.addEventListener('change', event => {
  const key = event.target.dataset.toggle;
  if (!key) return;
  visibility[key] = event.target.checked;
  $('#stage').classList.toggle('no-grid', !visibility.grid);
  $('#vertex-overlay').hidden = !visibility.labels || !scene;
  if (model) model.children.filter(child => child.userData.face).forEach(child => { child.visible = visibility.faces; });
  if (grid) grid.visible = visibility.grid;
  renderScene();
});

function disposeGroup(group) {
  if (!group) return;
  group.traverse(object => {
    object.geometry?.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(material => material?.dispose());
  });
  group.removeFromParent();
}
function buildModel() {
  if (!scene) return;
  disposeGroup(model);
  if (surfaceId) {
    classifySolid = null;
    model = createSurfaceModel(surfaceData);
    model.children.filter(child=>child.userData.face).forEach(child=>{child.visible=visibility.faces;});
    grid.position.y = surfaceData.bounds.min[1]-.035;
    scene.add(model); fitCamera(); renderScene(); return;
  }
  grid.position.y = Math.min(...SHAPES[shapeId].vertices.map(vertex=>vertex.position[1]))-.035;
  model = new THREE.Group();
  const shape = SHAPES[shapeId];
  classifySolid = createSolidVisibility(shape).classify;
  const p = id => shape.vertices.find(v => v.id === id).position;
  const vertices = [];
  for (const face of shape.faces) {
    for (let i = 1; i < face.length - 1; i++) vertices.push(...p(face[0]), ...p(face[i]), ...p(face[i+1]));
  }
  const faceGeometry = new THREE.BufferGeometry();
  faceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  faceGeometry.computeVertexNormals();
  const faces = new THREE.Mesh(faceGeometry, new THREE.MeshBasicMaterial({color:0x7fa6d7,transparent:true,opacity:.105,side:THREE.DoubleSide,depthWrite:false}));
  faces.userData.face = true; faces.visible = visibility.faces; model.add(faces);
  model.add(createSolidEdges(shape));
  vertexMeshes = shape.vertices.map(vertex => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(.045,12,12),new THREE.MeshBasicMaterial({color:0x3266df,transparent:true,depthWrite:false}));
    mesh.renderOrder = 3;
    mesh.position.fromArray(vertex.position); mesh.userData.vertex = vertex.id; model.add(mesh); return mesh;
  });
  scene.add(model);
  fitCamera();
  renderScene();
}
function renderSection() {
  if (surfaceId) { updateSurfaceSelection(); return; }
  const dual = intersectionTask() || (mode === 'lab' && labPlaneCount === 2);
  const showIntersection = dual && (mode === 'lab' || Boolean(feedback?.correct) || revealed.has(LESSONS[lessonIndex].id));
  $('#stage').dataset.intersectionVisible = String(Boolean(showIntersection && pairIntersection?.relation === 'intersecting'));
  if (!scene) return;
  disposeGroup(section); section = dual ? createPlaneIntersectionView(SHAPES[shapeId],pairSlices,pairIntersection,{showIntersection}) : createSectionView(SHAPES[shapeId], preview);
  scene.add(section);
  const markerColor = mode === 'lab' && labPlaneCount === 2 && activePlane === 1 ? 0x70509b : 0xc6841a;
  for (const mesh of vertexMeshes) {
    const active = selected.includes(mesh.userData.vertex);
    mesh.material.color.set(active ? markerColor : 0x3266df);
    mesh.scale.setScalar(active ? 1.5 : 1);
  }
  disposeGroup(pointMarkers);
  pointMarkers = new THREE.Group();
  $('#vertex-overlay').querySelectorAll('.edge-label').forEach(button=>button.remove());
  for (const id of selected) {
    const point = resolvePoint(SHAPES[shapeId],id);
    if (!point?.edge) continue;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(.06,12,12),new THREE.MeshBasicMaterial({color:markerColor,transparent:true,depthWrite:false}));
    mesh.renderOrder = 3;
    mesh.position.fromArray(point.position); mesh.userData.vertex = id; pointMarkers.add(mesh);
    const button = document.createElement('button');
    button.className = 'vertex-label edge-label selected'; button.dataset.vertex = id;
    button.textContent = point.label;
    button.setAttribute('aria-label',`Убрать точку ${point.label} на модели`);
    button.setAttribute('aria-pressed','true');
    $('#vertex-overlay').append(button);
  }
  scene.add(pointMarkers);
  renderScene();
}
function updateSurfaceSelection() {
  surfaceSlice = sliceSurface(surfaceData,planeControls.plane);
  if (!surfaceSlice.paths.length) {
    const plane = planeControls.plane;
    const touches = surfaceData.vertices.some(point=>Math.abs(point.reduce((sum,x,i)=>sum+x*plane.normal[i],plane.constant))<1e-7);
    $('#slice-info').textContent = touches ? 'Касание: площадного сечения нет' : 'Нет пересечения';
  } else if (surfaceSlice.area !== null) {
    $('#slice-info').textContent = surfaceSlice.area > 1e-8 ? `S ≈ ${surfaceSlice.area.toLocaleString('ru-RU',{maximumFractionDigits:2})}` : 'Касание: площадного сечения нет';
  } else $('#slice-info').textContent = 'Контур сечения · фрагмент поверхности';
  if (!scene) return;
  disposeGroup(section); section = createSurfaceSection(surfaceData,planeControls.plane,surfaceSlice);
  scene.add(section); renderScene();
}
function pickEdgeAt(clientX,clientY) {
  const shape = SHAPES[shapeId], rect = $('#stage').getBoundingClientRect();
  const x = clientX-rect.left, y = clientY-rect.top;
  let best;
  for (const edge of shape.edges) {
    const [from,to] = [...edge].sort();
    const a = new THREE.Vector3(...resolvePoint(shape,from).position), b = new THREE.Vector3(...resolvePoint(shape,to).position);
    const pa = a.clone().project(camera), pb = b.clone().project(camera);
    const ax = (pa.x*.5+.5)*sceneWidth, ay = (-pa.y*.5+.5)*sceneHeight;
    const bx = (pb.x*.5+.5)*sceneWidth, by = (-pb.y*.5+.5)*sceneHeight;
    const dx = bx-ax, dy = by-ay, length = dx*dx+dy*dy;
    if (length < 1) continue;
    const u = Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/length));
    const distance = Math.hypot(x-ax-u*dx,y-ay-u*dy);
    if (distance > 18) continue;
    const da = -a.clone().applyMatrix4(camera.matrixWorldInverse).z, db = -b.clone().applyMatrix4(camera.matrixWorldInverse).z;
    const t = u*da/((1-u)*db+u*da), depth = da*(1-t)+db*t;
    if (!best || distance < best.distance-2 || (Math.abs(distance-best.distance) <= 2 && depth < best.depth)) best = {from,to,t,distance,depth};
  }
  if (!best) { mobileHud.notice('Коснитесь ближе к ребру. Фигуру можно вращать.'); return false; }
  edgeControls.setPoint(best.from,best.to,Math.max(.01,Math.min(.99,Math.round(best.t*10000)/10000)));
  edgePicking = false; mobileHud.notice('');
  return true;
}
function fitCamera() {
  if (!camera || sceneWidth < 100 || sceneHeight < 100) return;
  camera.aspect = sceneWidth / sceneHeight;
  camera.zoom = 1;
  camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  const mobile = mobileHud.active;
  const margins = mobile ? {left:20,right:50,top:110,bottom:95} : {left:35,right:45,top:60,bottom:45};
  let zoom = 1;
  const fitVertices = surfaceId ? Array.from({length:8},(_,bits)=>({position:surfaceData.bounds.min.map((value,i)=>(bits & (1<<i)) ? surfaceData.bounds.max[i] : value)})) : SHAPES[shapeId].vertices;
  for (const vertex of fitVertices) {
    const point = new THREE.Vector3(...vertex.position).project(camera);
    if (point.x) zoom = Math.min(zoom, (1 - 2 * (point.x > 0 ? margins.right : margins.left) / sceneWidth) / Math.abs(point.x));
    if (point.y) zoom = Math.min(zoom, (1 - 2 * (point.y > 0 ? margins.top : margins.bottom) / sceneHeight) / Math.abs(point.y));
  }
  camera.zoom = Math.max(.1, zoom);
  camera.updateProjectionMatrix();
}
function resetView() {
  if (!camera) return;
  camera.position.set(3.6,2.6,4.4);
  controls.target.set(0,.05,0); controls.update(); fitCamera(); renderScene();
}
function showSceneFallback(lost = false) {
  renderScene = () => {};
  observer?.disconnect(); controls?.dispose();
  disposeGroup(model); disposeGroup(section); disposeGroup(pointMarkers);
  grid?.geometry.dispose(); grid?.material.dispose(); renderer?.dispose();
  scene = camera = model = section = grid = renderer = controls = observer = pointMarkers = null;
  edgePicking = false; $('[data-action="pick-edge"]').disabled = true;
  vertexMeshes = [];
  $('#vertex-overlay').hidden = true;
  $('.orbit-help').hidden = true;
  const title = lost ? 'Связь с 3D-моделью прервана' : '3D-модель недоступна';
  const message = lost ? 'Обновите страницу, чтобы восстановить чертёж. Можно продолжить выбирать вершины кнопками ниже.' : 'Браузер не поддерживает WebGL или аппаратное ускорение отключено. Включите его и обновите страницу. Задания и выбор вершин кнопками ниже по-прежнему работают.';
  $('#canvas-host').innerHTML = `<div class="webgl-error" role="alert"><strong>${title}</strong><p>${message}</p></div>`;
}
function initScene() {
  try {
    renderer = new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,2));
    renderer.setClearColor(0x000000,0);
    renderer.domElement.setAttribute('aria-label','Интерактивная модель многогранника');
    renderer.domElement.setAttribute('role','img');
    $('#canvas-host').append(renderer.domElement);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(38,1,.1,100);
    const stage = $('#stage');
    controls = new OrbitControls(camera,stage);
    controls.enableDamping = false; controls.enablePan = false;
    controls.minDistance = 4.5; controls.maxDistance = 12;
    controls.maxPolarAngle = Math.PI*.91;
    grid = new THREE.GridHelper(12,24,0xb9cadf,0xd1ddeb);
    grid.position.y = -1.035; grid.material.transparent = true; grid.material.opacity = .36;
    scene.add(grid);
    const project = new THREE.Vector3();
    renderScene = () => {
      if (disposed) return;
      const solidState = !surfaceId && classifySolid?.(camera.position.toArray());
      if (solidState) {
        updateSolidEdges(model.getObjectByName('solid-edges'),solidState.edges);
        for (const mesh of vertexMeshes) mesh.material.opacity = solidState.vertices[mesh.userData.vertex] ? 1 : selected.includes(mesh.userData.vertex) ? .6 : .28;
        for (const mesh of pointMarkers?.children || []) mesh.material.opacity = solidState.pointVisible(mesh.position.toArray()) ? 1 : .6;
      }
      renderer.render(scene,camera);
      SHAPES[shapeId].vertices.forEach((vertex,i) => {
        project.fromArray(vertex.position).project(camera);
        const button = projectedButtons[i];
        if (!button) return;
        button.dataset.occluded = String(Boolean(solidState && !solidState.vertices[vertex.id]));
        button.style.left = `${(project.x*.5+.5)*sceneWidth}px`;
        button.style.top = `${(-project.y*.5+.5)*sceneHeight}px`;
        button.style.zIndex = String(Math.round((1-project.z)*1000));
        button.style.visibility = project.z > 1 || project.z < -1 ? 'hidden' : 'visible';
      });
      $('#vertex-overlay').querySelectorAll('.edge-label').forEach(button => {
        const position = resolvePoint(SHAPES[shapeId],button.dataset.vertex).position;
        button.dataset.occluded = String(Boolean(solidState && !solidState.pointVisible(position)));
        project.fromArray(position).project(camera);
        button.style.left = `${(project.x*.5+.5)*sceneWidth}px`;
        button.style.top = `${(-project.y*.5+.5)*sceneHeight}px`;
        button.style.zIndex = String(2000+Math.round((1-project.z)*1000));
        button.style.visibility = project.z > 1 || project.z < -1 ? 'hidden' : 'visible';
      });
    };
    controls.addEventListener('change',renderScene);
    observer = new ResizeObserver(entries => {
      const {width,height} = entries[0].contentRect;
      if (!width || !height) return;
      sceneWidth = width; sceneHeight = height;
      fitCamera();
      renderer.setSize(width,height,false); renderScene();
    });
    observer.observe($('#stage'));
    let start, showPickedEdge = false;
    stage.addEventListener('click',event => {
      if (!showPickedEdge) return;
      showPickedEdge = false;
      // Open after this click's target is fixed, so the touch cannot toggle a newly placed summary.
      event.preventDefault(); event.stopPropagation();
      if (!mobileHud.open('points')) $('#edge-percent').focus({preventScroll:true});
    });
    const pointers = new Set();
    stage.addEventListener('pointerdown',event => {
      if (!renderer || event.button !== 0) return;
      pointers.add(event.pointerId);
      start = pointers.size === 1 ? {id:event.pointerId,x:event.clientX,y:event.clientY,vertex:event.target.closest('.vertex-label')?.dataset.vertex,dragged:false} : null;
    });
    stage.addEventListener('pointermove',event => {
      if (start?.id === event.pointerId && Math.hypot(event.clientX-start.x,event.clientY-start.y) > 6) start.dragged = true;
    });
    const cancelPointer = event => { pointers.delete(event.pointerId); start = null; };
    stage.addEventListener('pointercancel',cancelPointer);
    stage.addEventListener('lostpointercapture',cancelPointer);
    stage.addEventListener('pointerup',event => {
      pointers.delete(event.pointerId);
      const tap = start;
      start = null;
      if (!renderer || !camera || !tap || tap.id !== event.pointerId || tap.dragged || pointers.size || Math.hypot(event.clientX-tap.x,event.clientY-tap.y) > 6) return;
      if (edgePicking) { showPickedEdge = pickEdgeAt(event.clientX,event.clientY); return; }
      if (tap.vertex) { selectVertex(tap.vertex); return; }
      const rect = renderer.domElement.getBoundingClientRect();
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
      const hit = raycaster.intersectObjects([...vertexMeshes,...(pointMarkers?.children || [])])[0];
      if (hit) selectVertex(hit.object.userData.vertex);
    });
    renderer.domElement.addEventListener('webglcontextlost',event => {
      event.preventDefault();
      showSceneFallback(true);
    });
    resetView();
  } catch (error) {
    showSceneFallback();
    console.warn('Не удалось запустить WebGL:',error.message);
  }
}
window.addEventListener('pagehide', event => {
  if (event.persisted) return;
  disposed = true; observer?.disconnect(); controls?.dispose();
  disposeGroup(model); disposeGroup(section); disposeGroup(pointMarkers);
  grid?.geometry.dispose(); grid?.material.dispose(); renderer?.dispose();
});
initScene(); changeShape('cube'); updateProgress();
