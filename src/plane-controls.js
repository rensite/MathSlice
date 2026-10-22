export function planeFromAngles(state) {
  if (!state || !['inclination','azimuth','offset'].every(key=>Number.isFinite(state[key])) || state.inclination<0 || state.inclination>90 || state.azimuth<0 || state.azimuth>360) throw new Error('Expected finite plane angles and offset');
  const inclination = state.inclination*Math.PI/180, azimuth = state.azimuth*Math.PI/180;
  return {normal:[Math.sin(inclination)*Math.cos(azimuth),Math.cos(inclination),Math.sin(inclination)*Math.sin(azimuth)],constant:-state.offset};
}

export function createPlaneControls({onChange}) {
  const root = document.createElement('section');
  root.id = 'surface-controls'; root.className = 'surface-controls'; root.hidden = true;
  root.innerHTML = `<h2>Секущая плоскость</h2><p id="surface-equation" class="surface-equation"></p><p id="surface-description" class="surface-description"></p><div class="plane-presets" role="group" aria-label="Ракурс секущей плоскости"><button type="button" data-plane-preset="horizontal">Горизонтально</button><button type="button" data-plane-preset="vertical">Вертикально</button><button type="button" data-plane-preset="oblique">Под наклоном</button></div><label class="plane-control" for="plane-inclination"><span>Наклон <b id="plane-inclination-value"></b></span><input id="plane-inclination" data-plane-field="inclination" type="range" min="0" max="90" step="1" value="0" aria-label="Наклон плоскости"></label><label class="plane-control" for="plane-azimuth"><span>Поворот <b id="plane-azimuth-value"></b></span><input id="plane-azimuth" data-plane-field="azimuth" type="range" min="0" max="360" step="1" value="0" aria-label="Поворот плоскости"></label><label class="plane-control" for="plane-offset"><span>Смещение <b id="plane-offset-value"></b></span><input id="plane-offset" data-plane-field="offset" type="range" min="-3" max="3" step="0.01" value="0" aria-label="Смещение плоскости"></label><p class="plane-note">Смещение отсчитывается от начала координат вдоль нормали к плоскости. Знак задаёт сторону.</p><p id="surface-approximation" class="plane-note"></p><p id="plane-values" class="sr-only" aria-live="polite"></p>`;
  document.querySelector('.construction').after(root);
  let state = {inclination:0,azimuth:0,offset:0};
  const find = selector=>root.querySelector(selector);
  const summary = ()=>`${state.inclination}° · d = ${state.offset.toLocaleString('ru-RU',{maximumFractionDigits:2})}`;
  function refresh() {
    for (const key of ['inclination','azimuth','offset']) {
      find(`#plane-${key}`).value = String(state[key]);
      const text = key==='offset' ? state[key].toLocaleString('ru-RU',{maximumFractionDigits:2}) : `${state[key]}°`;
      find(`#plane-${key}-value`).textContent = text;
      find(`#plane-${key}`).setAttribute('aria-valuetext',text);
    }
    find('#plane-values').textContent = summary();
  }
  root.addEventListener('input',event=>{
    const key = event.target.dataset.planeField;
    if (!key) return;
    const next = {...state,[key]:Number(event.target.value)};
    planeFromAngles(next); state = next;
    refresh(); onChange(planeFromAngles(state));
  });
  root.addEventListener('click',event=>{
    const button = event.target.closest('[data-plane-preset]');
    if (!button) return;
    state = {inclination:{horizontal:0,vertical:90,oblique:45}[button.dataset.planePreset],azimuth:button.dataset.planePreset==='oblique'?35:0,offset:0};
    refresh(); onChange(planeFromAngles(state));
  });
  function reset(bounds,definition,initialOffset = 0) {
    const extent = bounds.min.map((x,i)=>Math.max(Math.abs(x),Math.abs(bounds.max[i])));
    const distance = Math.ceil(Math.hypot(...extent)*100)/100;
    find('#plane-offset').min = String(-distance); find('#plane-offset').max = String(distance);
    state = {inclination:0,azimuth:0,offset:initialOffset};
    find('#surface-equation').textContent = definition.equation;
    find('#surface-description').textContent = definition.description;
    find('#surface-approximation').textContent = definition.closed ? 'Контур и площадь вычисляются по полигональной модели. Знак ≈ означает приближённое значение.' : 'Показан ограниченный фрагмент поверхности. Контур может обрываться у его края. Площадь сечения тела не рассчитывается.';
    refresh();
  }
  refresh();
  return {reset,get plane(){return planeFromAngles(state);},get summary(){return summary();}};
}
