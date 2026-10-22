const text = value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const polyIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m12 2 9 5v10l-9 5-9-5V7l9-5ZM3 7l9 5 9-5m-9 5v10"/></svg>';
const surfaceIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><ellipse cx="12" cy="12" rx="9" ry="8"/><ellipse cx="12" cy="12" rx="4" ry="8"/><path d="M3 12h18"/></svg>';

export function renderExtraCatalog(polyhedra,surfaces,{showSurfaces=false}={}) {
  const buttons = (entries,smooth=false)=>entries.map(([id,item])=>`<button type="button" data-action="${smooth?'surface':'extra-shape'}" data-${smooth?'surface':'shape'}="${text(id)}" data-testid="choose-${smooth?'surface':'shape'}-${text(id)}" aria-label="${text(item.name)}" aria-pressed="false" title="${text(item.name)}">${smooth?surfaceIcon:polyIcon}<span>${text(item.shortName || item.name)}</span></button>`).join('');
  const group = (title,entries,smooth=false)=>`<section class="catalog-group"><h3>${title}</h3><div class="catalog-options">${buttons(entries,smooth)}</div></section>`;
  const advanced = showSurfaces ? group('Тела вращения',Object.entries(surfaces).filter(([,item])=>item.group==='school'),true)+group('Университет',Object.entries(surfaces).filter(([,item])=>item.group==='university'),true) : '';
  return `<details id="more-shapes" class="more-shapes"><summary><span class="more-collapsed">Показать ещё</span><span class="more-expanded">Свернуть каталог</span><span aria-hidden="true">⌄</span></summary><div class="more-shape-content"><p class="catalog-note">Дополнительные модели для свободного исследования. Зачёт курса не меняется.</p>${group('Школьные многогранники',Object.entries(polyhedra))}${advanced}</div></details>`;
}
