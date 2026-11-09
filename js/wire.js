import { NODE, WIRE } from './config.js';

const TAU = Math.PI * 2;
const round = (value) => Math.round(value * 100) / 100;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function pointAt(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;

  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

function tangentAt(p0, p1, p2, p3, t) {
  const u = 1 - t;

  const x = 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x);
  const y = 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y);

  const length = Math.hypot(x, y) || 1;

  return { x: x / length, y: y / length };
}

const normalOf = (tangent) => ({ x: -tangent.y, y: tangent.x });

function rotate(vector, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos,
  };
}

function linePath(a, b) {
  return `M ${round(a.x)} ${round(a.y)} L ${round(b.x)} ${round(b.y)}`;
}

export function edgesOf(from, to) {
  const p0 = { x: from.x + NODE.width, y: from.y + NODE.height / 2 };
  const p3 = { x: to.x, y: to.y + NODE.height / 2 };
  const bend = Math.max(28, Math.abs(p3.x - p0.x) * 0.42);
  const p1 = { x: p0.x + bend, y: p0.y };
  const p2 = { x: p3.x - bend, y: p3.y };

  return { p0, p1, p2, p3 };
}

/**
 * Шаг скрутки привязан к длине ребра, иначе короткие ветки выглядят
 * как две прямые, а длинные — как решётка.
 */
export function wireMarkup(from, to, { fresh = false, live = false } = {}) {
  const { p0, p1, p2, p3 } = edgesOf(from, to);

  const span = Math.hypot(p3.x - p0.x, p3.y - p0.y);
  const twists = clamp(Math.round(span / 24), 4, 12);
  const barbs = clamp(Math.round(span / 46), 2, 6);
  const steps = WIRE.samples;

  const strandA = [];
  const strandB = [];

  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const point = pointAt(p0, p1, p2, p3, t);
    const normal = normalOf(tangentAt(p0, p1, p2, p3, t));
    const swing = Math.sin(t * TAU * twists) * WIRE.amplitude;

    const first = {
      x: point.x + normal.x * swing,
      y: point.y + normal.y * swing,
    };
    const second = {
      x: point.x - normal.x * swing,
      y: point.y - normal.y * swing,
    };

    strandA.push(`${index ? 'L' : 'M'} ${round(first.x)} ${round(first.y)}`);
    strandB.push(`${index ? 'L' : 'M'} ${round(second.x)} ${round(second.y)}`);
  }

  const spikes = [];
  const knots = [];
  const length = WIRE.barbLength;

  for (let step = 1; step <= barbs; step += 1) {
    const t = step / (barbs + 1);
    const point = pointAt(p0, p1, p2, p3, t);
    const normal = normalOf(tangentAt(p0, p1, p2, p3, t));

    // два уса почти в противоположные стороны — классический «бант» колючки
    for (const [angle, scale] of [[0.34, 1], [Math.PI - 0.34, 1], [Math.PI / 2 + 0.25, 0.48]]) {
      const direction = rotate(normal, angle);
      const start = {
        x: point.x - direction.x * length * 0.2,
        y: point.y - direction.y * length * 0.2,
      };
      const end = {
        x: point.x + direction.x * length * scale,
        y: point.y + direction.y * length * scale,
      };

      spikes.push(linePath(start, end));
    }

    knots.push([round(point.x), round(point.y)]);
  }

  const className = ['wire', fresh ? 'is-fresh' : '', live ? 'wire--live' : '']
    .filter(Boolean)
    .join(' ');

  const dots = knots
    .map(([x, y]) => `<circle class="wire__knot" cx="${x}" cy="${y}" r="1.15"/>`)
    .join('');

  return `<g class="${className}">
      <path class="wire__shadow" d="M ${round(p0.x)} ${round(p0.y)} C ${round(p1.x)} ${round(p1.y)}, ${round(p2.x)} ${round(p2.y)}, ${round(p3.x)} ${round(p3.y)}"/>
      <path class="wire__strand" d="${strandA.join(' ')}"/>
      <path class="wire__strand wire__strand--alt" d="${strandB.join(' ')}"/>
      <path class="wire__barb" d="${spikes.join(' ')}"/>
      ${dots}
      <path class="wire__glint" d="M ${round(p0.x)} ${round(p0.y)} C ${round(p1.x)} ${round(p1.y)}, ${round(p2.x)} ${round(p2.y)}, ${round(p3.x)} ${round(p3.y)}"/>
    </g>`;
}
