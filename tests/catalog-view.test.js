import test from 'node:test';
import assert from 'node:assert/strict';

test('expanded catalog is natively collapsed and separates school polyhedra, round bodies and university surfaces', async()=>{
  const { renderExtraCatalog } = await import('../src/catalog-view.js');
  const html = renderExtraCatalog({tetrahedron:{id:'tetrahedron',name:'Тетраэдр',shortName:'Тетраэдр'}},{sphere:{id:'sphere',name:'Шар',group:'school'},ellipsoid:{id:'ellipsoid',name:'Эллипсоид',group:'university'}},{showSurfaces:true});
  assert.match(html,/<details id="more-shapes"/);
  assert.doesNotMatch(html,/<details[^>]*\sopen(?:\s|>)/);
  for (const text of ['Показать ещё','Школьные многогранники','Тела вращения','Университет','choose-shape-tetrahedron','choose-surface-sphere','choose-surface-ellipsoid']) assert.ok(html.includes(text),text);
  assert.equal((html.match(/data-action="extra-shape"/g)||[]).length,1);
  assert.equal((html.match(/data-action="surface"/g)||[]).length,2);
});

test('catalog names and identifiers are escaped instead of becoming markup', async()=>{
  const { renderExtraCatalog } = await import('../src/catalog-view.js');
  const html = renderExtraCatalog({'x"':{name:'<img src=x>',shortName:'<b>'}},{});
  assert.doesNotMatch(html,/<img|<b>/);
  assert.match(html,/&lt;img src=x&gt;/);
  assert.match(html,/&quot;/);
});

test('round bodies and university groups stay absent from the interface by default without deleting their catalog', async()=>{
  const { renderExtraCatalog } = await import('../src/catalog-view.js');
  const { EXTRA_SHAPES } = await import('../src/extra-shapes.js');
  const { SURFACES } = await import('../src/surfaces.js');
  const html = renderExtraCatalog(EXTRA_SHAPES,SURFACES);
  assert.match(html,/Школьные многогранники/);
  assert.equal((html.match(/data-action="extra-shape"/g)||[]).length,8);
  assert.doesNotMatch(html,/Тела вращения|Университет|data-action="surface"|choose-surface-/);
  assert.equal(Object.keys(SURFACES).length,12);
});
