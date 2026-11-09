export const byId = (id) => document.getElementById(id);

export const on = (target, type, handler, options) =>
  target.addEventListener(type, handler, options);

export const show = (element, visible = true) =>
  element?.classList.toggle('hidden', !visible);

export const text = (element, value) => {
  if (element) element.textContent = value;
};

export function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

export function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function debounce(fn, wait) {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
