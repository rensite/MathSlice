import { SHAPES, planeFromPoints } from './geometry.js';
import { edgePointId, resolvePoint } from './points.js';
import { intersectPlanes } from './plane-intersection.js';

/** Grade geometry, never target-ID equality. Empty selections do not infer a relation. */
export function validateIntersectionAnswer(lesson, selectedIds, answerRelation) {
  const fail = message => ({correct:false,message});
  if (lesson?.type !== 'intersection' || lesson.planeCount !== 2 || !Array.isArray(selectedIds)) return fail('Некорректное задание или список выбранных точек.');
  const shape = SHAPES[lesson.shapeId];
  if (!shape) return fail('Неизвестный многогранник.');
  let planes, relation;
  try {
    planes = planesFromLesson(shape,lesson.planes);
    relation = intersectPlanes(...planes).relation;
  } catch {
    return fail('Не удалось определить заданные плоскости.');
  }
  if (relation !== 'intersecting') {
    if (selectedIds.length || answerRelation !== relation) return fail('Уберите точки и явно выберите правильное взаимное положение плоскостей.');
    return {correct:true,message:relation === 'parallel' ? 'Верно: плоскости параллельны и не имеют общих точек.' : 'Верно: плоскости совпадают; единственной прямой пересечения нет.'};
  }
  if (answerRelation !== undefined && answerRelation !== 'intersecting') return fail('Эти плоскости пересекаются по прямой.');
  if (selectedIds.length !== 2) return fail('Выберите ровно две различные точки общей прямой.');
  const points = selectedIds.map(id => resolvePoint(shape,id));
  if (points.some(p => !p)) return fail('Используйте только вершины и корректные точки существующих рёбер.');
  const [a,b] = points.map(p => p.position);
  if (Math.hypot(...a.map((x,i) => x-b[i])) <= 1e-8) return fail('Точки должны занимать различные положения.');
  for (const {position} of points) for (const plane of planes) {
    const residual = plane.normal.reduce((s,x,i) => s+x*position[i],plane.constant);
    if (Math.abs(residual) > 1e-8) return fail('Каждая выбранная точка должна принадлежать обеим заданным плоскостям.');
  }
  return {correct:true,message:'Верно: две различные общие точки определяют прямую пересечения плоскостей.'};
}

/** Resolve exactly two triples through the same canonical point API as selection. */
export function planesFromLesson(shape, planes) {
  if (!Array.isArray(planes) || planes.length !== 2) throw new Error('Expected two planes');
  return planes.map(ids => {
    if (!Array.isArray(ids) || ids.length !== 3) throw new Error('Expected three plane references');
    return planeFromPoints(...ids.map(id => {
      const point = resolvePoint(shape,id);
      if (!point) throw new Error('Unknown or noncanonical plane point');
      return point.position;
    }));
  });
}

const mid = (shapeId,a,b) => edgePointId(SHAPES[shapeId],a,b,.5);
const make = (shapeId,suffix,level,title,planes,target,relation,definitions,hint,explanation) => {
  const names = new Map(definitions.map(([id,name]) => [id,name]));
  const planeNames = planes.map(ids => ids.map(id => names.get(id) ?? id).join(', '));
  return {
    id:`${shapeId}-intersection-${suffix}`,shapeId,type:'intersection',planeCount:2,
    level,title,planes,target,relation,
    task:`${definitions.length ? definitions.map(([,name,edge]) => `${name} — середина ребра ${edge}`).join('; ')+'. ' : ''}Даны плоскости (${planeNames[0]}) и (${planeNames[1]}). Определите их взаимное положение. Если они пересекаются, выберите две различные точки общей прямой; иначе без выбора точек укажите «параллельны» или «совпадают».`,
    hint,explanation,kind:relation === 'intersecting' ? 'Прямая пересечения' : relation === 'parallel' ? 'Параллельные плоскости' : 'Совпадающие плоскости',
    ...(definitions.length ? {pointMode:'edges'} : {}),
  };
};

const pA = mid('prism','A','A1'), pB = mid('prism','B','B1'), pC = mid('prism','C','C1');
const sA = mid('pyramid','A','S'), sB = mid('pyramid','B','S'), sC = mid('pyramid','C','S');
const hA = mid('hexprism','A','A1'), hB = mid('hexprism','B','B1'), hD = mid('hexprism','D','D1');

export const INTERSECTION_LESSONS = [
  make('cube','base-diagonal','intro','Куб: диагональ в основании',
    [['A','C','B1'],['A','B','C']],['A','C'],'intersecting',[],
    'Найдите две вершины основания, принадлежащие также наклонной плоскости.',
    'Вершины A и C лежат в обеих плоскостях. Плоскости различны: B1 не принадлежит основанию ABC. Поэтому их общая прямая — AC, а внутри куба виден отрезок AC.'),
  make('prism','mid-side','practice','Призма: средняя линия боковой грани',
    [[pA,pB,pC],['A','B','B1']],[pA,pB],'intersecting',[[pA,'P','A→A1'],[pB,'Q','B→B1'],[pC,'R','C→C1']],
    'Плоскость PQR параллельна основаниям. Где она встречает боковую грань ABB1A1?',
    'P и Q принадлежат плоскости PQR и боковой грани ABB1A1. Следовательно, общая прямая — PQ. Это средняя линия грани, параллельная AB.'),
  make('pyramid','mid-diagonal','challenge','Пирамида: диагональ среднего сечения',
    [['A','C','S'],[sA,sB,sC]],[sA,sC],'intersecting',[[sA,'P','A→S'],[sB,'Q','B→S'],[sC,'R','C→S']],
    'Рассмотрите треугольник SAC и середины его боковых сторон.',
    'Среднее сечение PQR параллельно основанию. Диагональная плоскость ACS содержит середины P и R рёбер AS и CS. Общая прямая PR параллельна AC; внутри пирамиды это диагональ среднего квадратного сечения.'),
  make('cuboid','space-diagonal','challenge','Параллелепипед: пространственная диагональ',
    [['A','C1','D'],['B','B1','D']],['D','B1'],'intersecting',[],
    'Первая плоскость содержит ребро AD и прямую через C1, параллельную AD. Найдите на ней ещё вершину.',
    'Через C1 проходит ребро C1B1, параллельное AD, поэтому B1 принадлежит плоскости ADC1. Вторая плоскость BB1D тоже содержит B1 и D. Плоскости различны, а их общая прямая — пространственная диагональ DB1.'),
  make('hexprism','mid-diameter','practice','Шестиугольная призма: диаметр на средней высоте',
    [[hA,hB,hD],['A','D','A1']],[hA,hD],'intersecting',[[hA,'P','A→A1'],[hB,'Q','B→B1'],[hD,'R','D→D1']],
    'Диагональная плоскость ADA1 содержит противоположные боковые рёбра AA1 и DD1.',
    'Плоскость PQR проходит на половине высоты призмы. Плоскость ADA1 содержит рёбра AA1 и DD1, а значит и их середины P и R. Прямая PR параллельна большой диагонали основания AD.'),
  make('octahedron','axis','practice','Октаэдр: ось двух диагональных плоскостей',
    [['A','C','S'],['B','D','S']],['S','T'],'intersecting',[],
    'Обе диагональные плоскости проходят через центр квадрата ABCD и вершину S. Какая ещё вершина лежит на этой оси?',
    'Диагонали AC и BD пересекаются в центре экваториального квадрата. Каждая заданная плоскость содержит этот центр и S. Их общая прямая проходит также через противоположную вершину T: это ось ST.'),
  make('cube','parallel','intro','Куб: плоскости двух оснований',
    [['A','B','C'],['A1','B1','C1']],[],'parallel',[],
    'Сравните плоскости нижней и верхней граней куба.',
    'Плоскости ABC и A1B1C1 содержат противоположные грани куба. Они параллельны и различны, поэтому общей прямой нет. Выберите «параллельны» без точек.'),
  make('cube','coincident','intro','Куб: разные тройки одной грани',
    [['A','B','C'],['B','C','D']],[],'coincident',[],
    'Проверьте, принадлежат ли все четыре вершины одной грани.',
    'Неколлинеарные тройки ABC и BCD задают одну и ту же плоскость основания ABCD. Плоскости совпадают: общих прямых бесконечно много, единственной прямой пересечения нет. Выберите «совпадают» без точек.'),
];
