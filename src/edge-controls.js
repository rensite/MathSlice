import { edgePointId, resolvePoint } from './points.js';

// Exact presets retain thirds; percentage inputs set an arbitrary interior point.
export function createEdgeControls({ getShape, getSelected, onSelect, onPick, getLimit = ()=>3 }) {
  const root = document.createElement('div');
  root.className = 'edge-point-tools';
  root.innerHTML = `<div id="edge-selected" class="edge-selected" aria-label="Выбранные точки на рёбрах"></div><details id="edge-tools"><summary>Точки на рёбрах</summary><div class="edge-editor"><label for="edge-select">Ребро</label><select id="edge-select" aria-label="Ребро"></select><p id="edge-direction" class="edge-direction"></p><div class="edge-fractions" role="group" aria-label="Точное деление ребра"><button type="button" data-action="edge-fraction" data-fraction="half">½ Середина</button><button type="button" data-action="edge-fraction" data-fraction="third">1:2</button><button type="button" data-action="edge-fraction" data-fraction="two-thirds">2:1</button></div><div class="edge-position-row"><input id="edge-position" type="range" min="1" max="99" step="any" value="50" aria-label="Положение точки на ребре" aria-describedby="edge-direction"><label class="edge-percent-label"><input id="edge-percent" type="number" min="1" max="99" step="any" value="50" inputmode="decimal" aria-label="Положение от первой вершины, %" aria-describedby="edge-direction">%</label></div><p id="edge-point-preview" aria-live="polite"></p><button type="button" class="primary-button" data-testid="add-edge-point">Выбрать точку</button><button type="button" class="text-button" data-action="pick-edge">Указать ребро на модели</button><p class="edge-help">Процент отсчитывается от первой вершины. Концы ребра выбираются как обычные вершины.</p></div></details>`;
  document.querySelector('.construction').append(root);
  const find = selector => root.querySelector(selector);
  const select = find('#edge-select'), range = find('#edge-position'), number = find('#edge-percent');
  const add = find('[data-testid="add-edge-point"]');
  let fraction = .5, valid = true;
  const point = () => {
    const [from,to] = select.value.split(':');
    return resolvePoint(getShape(), edgePointId(getShape(),from,to,fraction));
  };
  function refresh() {
    const selected = getSelected();
    const list = find('#edge-selected');
    const focused = list.contains(document.activeElement) ? document.activeElement.dataset.vertex : null;
    list.replaceChildren();
    for (const id of selected) {
      const item = resolvePoint(getShape(),id);
      if (!item?.edge) continue;
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.vertex = id;
      button.textContent = `${item.label} ×`;
      button.setAttribute('aria-label',`Убрать точку ${item.label}`);
      button.setAttribute('aria-pressed','true');
      list.append(button);
    }
    const current = point();
    find('#edge-direction').textContent = `От ${current.edge[0].replace('1','₁')} к ${current.edge[1].replace('1','₁')}`;
    find('#edge-point-preview').textContent = valid ? current.label : 'Введите положение от 1 до 99%.';
    number.setAttribute('aria-invalid',String(!valid));
    add.disabled = !valid || (selected.length >= getLimit() && !selected.includes(current.id));
    add.textContent = selected.includes(current.id) ? 'Убрать точку' : 'Выбрать точку';
    if (focused) ([...list.children].find(button=>button.dataset.vertex===focused) || list.firstElementChild || (add.disabled ? select : add)).focus({preventScroll:true});
    for (const button of root.querySelectorAll('[data-fraction]')) {
      const value = {half:.5,third:1/3,'two-thirds':2/3}[button.dataset.fraction];
      button.setAttribute('aria-pressed',String(Math.abs(fraction-value) < 1e-8));
    }
  }
  function setFraction(value) {
    fraction = value; valid = true;
    range.value = String(value*100); number.value = String(value*100);
    refresh();
  }
  select.addEventListener('change',() => { valid = true; setFraction(fraction); });
  for (const input of [range,number]) input.addEventListener('input',() => {
    const value = input.value === '' ? NaN : Number(input.value);
    valid = Number.isFinite(value) && value >= 1 && value <= 99;
    if (valid) { fraction = value/100; if (input === range) number.value = input.value; else range.value = input.value; }
    refresh();
  });
  root.addEventListener('click',event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.fraction) setFraction({half:.5,third:1/3,'two-thirds':2/3}[button.dataset.fraction]);
    if (button === add && valid) onSelect(point().id);
    if (button.dataset.action === 'pick-edge') onPick();
  });
  function reset({ open = false } = {}) {
    select.replaceChildren();
    for (const edge of getShape().edges) {
      const pair = [...edge].sort();
      const option = document.createElement('option');
      option.value = pair.join(':'); option.textContent = pair.map(id=>id.replace('1','₁')).join(' — ');
      select.append(option);
    }
    find('#edge-tools').open = open;
    setFraction(.5);
  }
  function setPoint(from,to,value) {
    const resolved = resolvePoint(getShape(),edgePointId(getShape(),from,to,value));
    if (!resolved?.edge) return;
    select.value = resolved.edge.join(':');
    setFraction(resolved.t);
    find('#edge-tools').open = true;
  }
  return { refresh, reset, setPoint };
}
