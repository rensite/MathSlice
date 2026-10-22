import test from 'node:test';
import assert from 'node:assert/strict';

test('one-plane tasks have no extra controls; only lab can add and independently select a second plane',async()=>{
  const {renderPlaneTools}=await import('../src/plane-task-view.js');
  assert.equal(renderPlaneTools({lab:false,intersectionTask:false}),'');
  const single=renderPlaneTools({lab:true,planeCount:1,activePlane:0});
  assert.match(single,/Добавить плоскость β/);
  assert.doesNotMatch(single,/data-action="active-plane"/);
  const dual=renderPlaneTools({lab:true,planeCount:2,activePlane:1});
  assert.match(dual,/data-plane="1" aria-pressed="true"/);
  assert.match(dual,/Убрать β/);
});

test('two-plane tasks offer classification and never expose lab editing controls',async()=>{
  const {renderPlaneTools,renderIntersectionTask}=await import('../src/plane-task-view.js');
  const tools=renderPlaneTools({intersectionTask:true,answerRelation:'parallel'});
  assert.match(tools,/Параллельны/);assert.match(tools,/Совпадают/);
  assert.doesNotMatch(tools,/Добавить плоскость|Убрать β/);
  const lesson={title:'<b>Задача</b>',task:'Найдите общую прямую',planes:[['A','B','C'],['A','B','S']],hint:'Подсказка',kind:'Прямая',explanation:'Разбор',target:['A','B']};
  const html=renderIntersectionTask({lesson,label:id=>id,index:42,total:50,ready:false});
  assert.match(html,/&lt;b&gt;Задача&lt;\/b&gt;/);
  assert.match(html,/Плоскость α/);assert.match(html,/Плоскость β/);
  assert.match(html,/data-testid="check-answer" disabled/);
  assert.doesNotMatch(html,/Разбор|explanation/);
});
