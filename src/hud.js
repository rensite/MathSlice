// One model viewport; existing controls move into a single native modal sheet.
export function createMobileHud({ onClose } = {}) {
  const media = window.matchMedia('(max-width: 760px), (max-height: 500px) and (pointer: coarse)');
  const dialog = document.querySelector('#mobile-sheet');
  const content = document.querySelector('#sheet-content');
  const menu = document.querySelector('#sheet-menu');
  const closeButton = dialog.querySelector('[data-action="close-sheet"]');
  const sources = {
    task: ['.workspace-heading', '#lesson-rail'],
    points: ['.construction', '#surface-controls', '.board-bottom'],
    settings: ['.shape-picker', '.drawing-settings'],
  };
  let moved = [], current = null, opener = null;

  function restore() {
    for (const { node, placeholder, open } of moved) {
      placeholder.replaceWith(node);
      if (open !== undefined) node.open = open;
    }
    moved = [];
  }
  function finishClose() {
    if (!current) return;
    restore();
    current = null;
    onClose?.();
    const usableOpener = opener?.isConnected && !opener.matches(':disabled') && opener.getClientRects().length && getComputedStyle(opener).visibility !== 'hidden';
    const target = usableOpener ? opener : document.querySelector(media.matches ? '[data-testid="hud-task"]' : '#workspace-title');
    target.focus({ preventScroll: true });
  }
  function close() {
    if (dialog.open) dialog.close();
    finishClose();
  }
  function open(kind, title) {
    if (!media.matches) return false;
    if (!dialog.open) opener = document.activeElement;
    restore();
    current = kind;
    dialog.dataset.sheet = kind;
    document.querySelector('#sheet-title').textContent = title || {
      menu: 'Сечение', task: 'Условие и решение', points: 'Выбор точек', settings: 'Вид и фигура',
    }[kind];
    menu.hidden = kind !== 'menu';
    content.replaceChildren();
    for (const selector of sources[kind] || []) {
      const node = document.querySelector(selector);
      const placeholder = document.createComment('sheet-home');
      node.before(placeholder);
      const open = node instanceof HTMLDetailsElement ? node.open : undefined;
      moved.push({ node, placeholder, open });
      if (open !== undefined) node.open = true;
      content.append(node);
    }
    if (!dialog.open) dialog.showModal();
    content.scrollTop = 0;
    closeButton.focus({ preventScroll: true });
    return true;
  }
  dialog.addEventListener('close', () => { if (!dialog.open) finishClose(); });
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientY < rect.top || event.clientX < rect.left || event.clientX > rect.right || event.clientY > rect.bottom)) close();
  });
  media.addEventListener('change', () => { if (!media.matches) close(); });

  function update({ mode, index, total, shape, target, selected, blocked, solved, planeSummary = null, limit = 3, ready = selected.length === limit, targetSummary = null, selectionSummary = null }) {

    document.querySelector('#hud-task-title').textContent = mode === 'training' ? `Задание ${index + 1} / ${total}` : 'Лаборатория';
    document.querySelector('#hud-task-detail').textContent = mode === 'training' ? (targetSummary || target.join(' · ')) : shape;
    document.querySelector('#hud-selection').textContent = planeSummary || selectionSummary || (selected.length ? selected.join(' · ') : `0 / ${limit}`);
    document.querySelector('#hud-points-title').textContent = planeSummary ? 'Плоскость' : 'Точки';
    document.querySelector('[data-testid="hud-points"]').setAttribute('aria-label',planeSummary ? 'Настроить секущую плоскость' : 'Выбрать точки');
    document.querySelector('[data-testid="hud-undo"]').hidden = Boolean(planeSummary);
    const check = document.querySelector('[data-testid="hud-check"]');
    check.hidden = mode !== 'training';
    check.disabled = !ready || blocked;
    document.querySelector('[data-testid="hud-undo"]').disabled = selected.length === 0;
    document.querySelector('#hud-progress').textContent = `${solved} / ${total}`;
  }
  function notice(message) {
    const node = document.querySelector('#hud-notice');
    node.textContent = message;
    node.hidden = !message;
  }
  return { open, close, update, notice, get active() { return media.matches; }, get sheet() { return current; } };
}
