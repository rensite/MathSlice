import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCourseLibrary, renderCourseProgress } from '../src/course-view.js';

const levels = [{id:'intro',label:'Основы'}, {id:'practice',label:'Практика'}, {id:'challenge',label:'Вызов'}];
const lessons = [
  { id:'face', shapeId:'cube', title:'Грань <куба>', level:'intro' },
  { id:'diagonal', shapeId:'cube', title:'Диагональ', level:'challenge' },
];
const props = {
  lessons, levels, shapes: {cube:{name:'Куб'}}, progress:{solved:['face'],revealed:[]}, activeId:'face', filter:'all', expanded:new Set(['cube']),
  summary:{total:2,solved:1,studied:1,revealed:0,percent:50,nextLessonId:'diagonal',byShape:[{shapeId:'cube',total:2,solved:1,studied:1,revealed:0,percent:50}],byLevel:levels.map(level=>({...level,total:level.id==='practice'?0:1,solved:level.id==='intro'?1:0}))},
};

test('course view renders grouped original lessons, honest status, recommendation and level filter', () => {
  const html = renderCourseLibrary(props);
  assert.equal((html.match(/data-action="lesson"/g) || []).length, 2);
  assert.equal((html.match(/data-action="filter-level"/g) || []).length, 4);
  assert.match(html, /data-course-shape="cube" open/);
  assert.match(html, /data-action="continue-course"/);
  assert.match(html, /Грань &lt;куба&gt;/);
  assert.doesNotMatch(html, /Грань <куба>/);
  const filtered = renderCourseLibrary({...props,filter:'challenge'});
  assert.equal((filtered.match(/data-action="lesson"/g) || []).length, 1);
  assert.match(filtered, /data-testid="lesson-diagonal"/);
  assert.doesNotMatch(filtered, /data-testid="lesson-face"/);
});

test('progress view distinguishes independently solved lessons from reviewed answers', () => {
  const progress = {...props.progress,solved:[],revealed:['face']};
  const summary = {...props.summary,solved:0,revealed:1,percent:0,byShape:[{...props.summary.byShape[0],solved:0,revealed:1,percent:0}]};
  const html = renderCourseProgress({...props,progress,summary});
  assert.match(html, /Разобрано без зачёта/);
  assert.match(html, /Ответ разобран/);
  assert.doesNotMatch(html, /lesson-number done/);
  assert.match(html, /Прогресс по сложности/);
  const complete = renderCourseLibrary({...props,summary:{...summary,nextLessonId:null}});
  assert.match(complete, /Показанные ответы не засчитываются/);
  assert.doesNotMatch(complete, /data-action="continue-course"/);
});

test('course identifies two-plane tasks without relabeling legacy single-plane tasks',()=>{
  const html=renderCourseLibrary({...props,lessons:[lessons[0],{...lessons[1],type:'intersection',planeCount:2}]});
  assert.equal((html.match(/Две плоскости/g)||[]).length,1);
  assert.match(html,/data-plane-count="2"/);
});
