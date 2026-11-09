import { NODE, ROOT_ID } from './config.js';
import { clamp, esc } from './dom.js';
import { buildIndex, collectVisible, depthOf, descendantsOf, place } from './layout.js';
import { wireMarkup } from './wire.js';
import { SparkField } from './sparks.js';

const MIN_SCALE = 0.35;
const MAX_SCALE = 2.2;

export class GraphView {
  constructor({ host, stage, canvas, onSelect }) {
    this.host = host;
    this.stage = stage;
    this.sparkCanvas = canvas;
    this.sparks = new SparkField(host, canvas);
    this.onSelect = onSelect;

    this.nodes = [];
    this.index = buildIndex([]);
    this.positions = new Map();
    this.expanded = new Set();
    this.known = new Set();

    this.view = { x: 0, y: 0, scale: 1 };
    this.fitted = false;
    this.loading = false;
    this.selectedId = ROOT_ID;
    this.query = '';
    this.drag = null;
    this.message = '';

    this.bindEvents();
  }

  /* ---------- public ---------- */

  setNodes(nodes) {
    this.nodes = nodes;
    this.index = buildIndex(nodes);
    this.fitted = false;
  }

  setLoading(value) {
    this.loading = value;
  }

  setMessage(value) {
    this.message = value;
  }

  setQuery(value) {
    this.query = value;
    this.fitted = false;
    this.render();
  }

  select(id, { redraw = true } = {}) {
    const node = this.index.byId.get(id);
    if (!node) return;

    this.selectedId = id;
    this.onSelect?.(node);

    if (redraw) this.render();
  }

  resetView() {
    this.view = { x: 0, y: 0, scale: 1 };
    this.fitted = false;
    this.render();
  }

  refit() {
    this.fitted = false;
    this.render();
  }

  /* ---------- rendering ---------- */

  render() {
    if (this.loading) {
      this.stage.innerHTML = '<div class="graph__empty">Загрузка дерева…</div>';
      return;
    }

    if (this.message) {
      this.stage.innerHTML = `<div class="graph__empty">${esc(this.message)}</div>`;
      return;
    }

    const visible = collectVisible(this.nodes, this.index, {
      expanded: this.expanded,
      query: this.query,
    });

    if (!visible.length) {
      this.stage.innerHTML = '<div class="graph__empty">Ничего не найдено.</div>';
      return;
    }

    const layout = place(visible, this.index);
    if (!layout.points.size) {
      this.stage.innerHTML = '<div class="graph__empty">Корень дерева не найден.</div>';
      return;
    }

    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);

    const padX = NODE.width;
    const padY = NODE.height * 1.8;
    const contentWidth = Math.max(NODE.width, layout.maxX - layout.minX + padX * 2);
    const contentHeight = Math.max(NODE.height, layout.maxY - layout.minY + padY * 2);
    const offsetX = padX - layout.minX;
    const offsetY = padY - layout.minY;

    this.positions = new Map();

    for (const node of visible) {
      const point = layout.points.get(node.id);
      if (!point) continue;

      this.positions.set(node.id, { x: point.x + offsetX, y: point.y + offsetY });
    }

    this.fitView(width, height, contentWidth, contentHeight);

    const edges = this.buildEdges(visible);
    const nodes = this.buildNodes(visible);

    this.stage.innerHTML = `<svg class="graph__svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <g class="graph__content" transform="translate(${this.view.x} ${this.view.y}) scale(${this.view.scale})">
        ${edges}
        ${nodes}
      </g>
    </svg>`;

    this.known = new Set(this.nodes.map((node) => node.id));
    this.syncSparkTransform();

    const meta = document.getElementById('graphMeta');
    if (meta) meta.textContent = `${visible.length} / ${this.nodes.length} узлов`;
  }

  syncSparkTransform() {
    this.sparkCanvas.style.transform =
      `translate(${this.view.x}px, ${this.view.y}px) scale(${this.view.scale})`;
  }

  fitView(width, height, contentWidth, contentHeight) {
    if (this.fitted) return;

    this.view.scale = clamp(
      Math.min((width - 40) / contentWidth, (height - 40) / contentHeight, 1),
      0.25,
      1
    );
    this.view.x = (width - contentWidth * this.view.scale) / 2;
    this.view.y = (height - contentHeight * this.view.scale) / 2;
    this.fitted = true;
  }

  buildEdges(visible) {
    let markup = '';

    for (const node of visible) {
      if (!node.parent) continue;

      const from = this.positions.get(node.parent);
      const to = this.positions.get(node.id);
      if (!from || !to) continue;

      const fresh = !this.known.has(node.id);
      const live = node.id === this.selectedId || node.parent === this.selectedId;

      markup += wireMarkup(from, to, { fresh, live });
    }

    return markup;
  }

  buildNodes(visible) {
    return visible
      .map((node, index) => {
        const position = this.positions.get(node.id);
        if (!position) return '';

        const label = node.label.length > 18 ? `${node.label.slice(0, 17)}…` : node.label;
        const kids = (this.index.children.get(node.id) || []).length;
        const expandable = node.id !== ROOT_ID && kids > 0;
        const sign = expandable ? (this.expanded.has(node.id) ? '−' : '+') : '';
        const entering = !this.known.has(node.id);

        const classes = [
          'node',
          node.id === ROOT_ID ? 'node--root' : '',
          node.id === this.selectedId ? 'selected' : '',
          entering ? 'node--enter' : '',
        ]
          .filter(Boolean)
          .join(' ');

        const delay = Math.min(index * 26, 340);

        return `<g class="${classes}" data-id="${esc(node.id)}" tabindex="0" role="button"
            aria-label="${esc(node.label)}" transform="translate(${position.x} ${position.y})">
            <g class="node__body"${entering ? ` style="--enter-delay:${delay}ms"` : ''}>
              <rect class="node__plate" width="${NODE.width}" height="${NODE.height}" rx="7"/>
              <rect class="node__plate-inner" x="1.5" y="1.5" width="${NODE.width - 3}" height="${NODE.height - 3}" rx="6"/>
              <circle class="node__pin" cx="13" cy="${NODE.height / 2}" r="2.3"/>
              <text class="node__label" x="${NODE.width / 2 + 4}" y="${NODE.height / 2 + 4}" text-anchor="middle">${esc(label)}</text>
              <text class="node__sign" x="${NODE.width - 13}" y="15" text-anchor="middle">${sign}</text>
            </g>
          </g>`;
      })
      .join('');
  }

  /* ---------- events ---------- */

  bindEvents() {
    this.stage.addEventListener('click', (event) => {
      const target = event.target.closest('.node');
      if (target) this.activate(target.dataset.id);
    });

    this.stage.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;

      const target = event.target.closest('.node');
      if (!target) return;

      event.preventDefault();
      this.activate(target.dataset.id);
    });

    this.host.addEventListener('pointerdown', (event) => {
      if (event.target.closest('.node') || event.button !== 0) return;

      this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, vx: this.view.x, vy: this.view.y };
      this.host.classList.add('dragging');
      this.host.setPointerCapture(event.pointerId);
    });

    this.host.addEventListener('pointermove', (event) => {
      if (!this.drag || event.pointerId !== this.drag.id) return;

      this.view.x = this.drag.vx + event.clientX - this.drag.x;
      this.view.y = this.drag.vy + event.clientY - this.drag.y;
      this.applyTransform();
    });

    const stop = (event) => {
      if (!this.drag || event.pointerId !== this.drag.id) return;
      this.drag = null;
      this.host.classList.remove('dragging');
    };

    this.host.addEventListener('pointerup', stop);
    this.host.addEventListener('pointercancel', stop);

    this.host.addEventListener('wheel', (event) => {
      event.preventDefault();

      const rect = this.host.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const previous = this.view.scale;
      const next = clamp(previous * (event.deltaY < 0 ? 1.1 : 0.9), MIN_SCALE, MAX_SCALE);

      this.view.x = x - ((x - this.view.x) * next) / previous;
      this.view.y = y - ((y - this.view.y) * next) / previous;
      this.view.scale = next;
      this.applyTransform();
    }, { passive: false });

    window.addEventListener('resize', () => this.refit());
  }

  applyTransform() {
    const content = this.stage.querySelector('.graph__content');
    if (!content) return;

    content.setAttribute(
      'transform',
      `translate(${this.view.x} ${this.view.y}) scale(${this.view.scale})`
    );
    this.syncSparkTransform();
  }

  activate(id) {
    const node = this.index.byId.get(id);
    if (!node) return;

    const kids = this.index.children.get(id) || [];
    const depth = depthOf(node, this.index);

    if (kids.length && depth >= 1) {
      if (this.expanded.has(id)) {
        this.expanded.delete(id);
        for (const childId of descendantsOf(id, this.index)) this.expanded.delete(childId);
      } else {
        this.expanded.add(id);
        this.fitted = false;
      }
    }

    this.selectedId = id;
    this.onSelect?.(node);
    this.render();
    this.emitSparks(id, kids.length ? 1.25 : 0.85);
  }

  emitSparks(id, power) {
    const position = this.positions.get(id);
    if (!position) return;

    // координаты в системе графа: частицы едут вместе с полотном при панорамировании
    const x = position.x + NODE.width / 2;
    const y = position.y + NODE.height;

    requestAnimationFrame(() => {
      this.sparks.burst(x, y, {
        count: Math.round(11 + Math.random() * 8),
        spread: (NODE.width / 2) * 0.8,
        power,
      });
    });
  }
}
