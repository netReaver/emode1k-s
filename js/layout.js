import { ROOT_ID, NODE } from './config.js';

export function buildIndex(nodes) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map();

  for (const node of nodes) {
    if (!node.parent || !byId.has(node.parent)) continue;
    if (!children.has(node.parent)) children.set(node.parent, []);
    children.get(node.parent).push(node);
  }

  for (const list of children.values()) {
    list.sort((a, b) => a.label.localeCompare(b.label, 'ru'));
  }

  return { byId, children };
}

export function depthOf(node, index) {
  let depth = 0;
  let current = node;
  const seen = new Set();

  while (current.parent && index.byId.has(current.parent) && !seen.has(current.id)) {
    seen.add(current.id);
    depth += 1;
    current = index.byId.get(current.parent);
  }

  return depth;
}

export function descendantsOf(id, index) {
  const result = new Set([id]);
  const stack = [id];

  while (stack.length) {
    const current = stack.pop();
    for (const child of index.children.get(current) || []) {
      if (result.has(child.id)) continue;
      result.add(child.id);
      stack.push(child.id);
    }
  }

  return result;
}

export function branchVisible(node, index, expanded) {
  let current = node;
  let guard = 0;

  while (current.parent && index.byId.has(current.parent) && guard < 64) {
    guard += 1;
    const parent = index.byId.get(current.parent);

    // верхний уровень всегда на виду, глубже — только по раскрытию
    if (depthOf(parent, index) >= 1 && !expanded.has(parent.id)) return false;

    current = parent;
  }

  return true;
}

export function collectVisible(nodes, index, { expanded, query }) {
  if (!query) return nodes.filter((node) => branchVisible(node, index, expanded));

  const term = query.toLocaleLowerCase();
  const found = new Map();

  for (const node of nodes) {
    const haystack = `${node.label} ${node.info}`.toLocaleLowerCase();
    if (!haystack.includes(term)) continue;

    found.set(node.id, node);

    let current = node;
    let guard = 0;

    while (current.parent && index.byId.has(current.parent) && guard < 64) {
      guard += 1;
      current = index.byId.get(current.parent);
      found.set(current.id, current);
    }
  }

  return [...found.values()];
}

/**
 * Раскладка слева направо: глубина задаёт X, листья делят высоту поровну.
 */
export function place(visible, index, metrics = NODE) {
  const ids = new Set(visible.map((node) => node.id));
  const points = new Map();

  if (!ids.has(ROOT_ID) || !index.byId.has(ROOT_ID)) {
    return { points, minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }

  const kids = (id) => (index.children.get(id) || []).filter((node) => ids.has(node.id));

  const leaves = (node, seen) => {
    if (seen.has(node.id)) return 1;

    const next = new Set(seen).add(node.id);
    const list = kids(node.id);

    if (!list.length) return 1;

    return list.reduce((sum, child) => sum + leaves(child, next), 0);
  };

  function placeSubtree(node, depth, startY, seen = new Set()) {
    if (seen.has(node.id)) return;

    const next = new Set(seen).add(node.id);
    const list = kids(node.id);
    const count = list.length
      ? list.reduce((sum, child) => sum + leaves(child, next), 0)
      : 1;

    points.set(node.id, {
      x: depth * (metrics.width + metrics.gapX),
      y: startY + ((count - 1) * metrics.row) / 2,
    });

    let cursor = startY;

    for (const child of list) {
      const childCount = leaves(child, next);
      placeSubtree(child, depth + 1, cursor, next);
      cursor += childCount * metrics.row;
    }
  }

  points.set(ROOT_ID, { x: 0, y: 0 });

  const top = kids(ROOT_ID);
  const total = top.reduce((sum, child) => sum + leaves(child, new Set()), 0);
  let cursor = -(((total || 1) - 1) * metrics.row) / 2;

  for (const child of top) {
    const count = leaves(child, new Set());
    placeSubtree(child, 1, cursor);
    cursor += count * metrics.row;
  }

  const all = [...points.values()];

  return {
    points,
    minX: Math.min(...all.map((point) => point.x)),
    maxX: Math.max(...all.map((point) => point.x)),
    minY: Math.min(...all.map((point) => point.y)),
    maxY: Math.max(...all.map((point) => point.y)),
  };
}
