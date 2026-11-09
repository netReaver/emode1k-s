import { byId, on } from './dom.js';

const MIN_VISIBLE = 1500;
const HARD_LIMIT = 7000;

export function bootLoader() {
  const loader = byId('loader');
  const word = byId('loaderWord');
  const caption = byId('loaderCaption');
  const image = byId('loaderImage');

  if (!loader) return { close() {}, say() {} };

  const started = performance.now();
  let closed = false;

  const previousHtml = document.documentElement.style.overflow;
  const previousBody = document.body.style.overflow;

  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';

  if (image) {
    on(image, 'error', () => image.classList.add('is-broken'), { once: true });
  }

  const spell = setTimeout(() => word?.classList.add('complete'), MIN_VISIBLE - 260);
  const hardStop = setTimeout(() => close(), HARD_LIMIT);

  on(window, 'load', () => setTimeout(() => close(), 420), { once: true });

  function close() {
    if (closed) return;
    closed = true;

    clearTimeout(spell);
    clearTimeout(hardStop);

    const elapsed = performance.now() - started;
    const wait = Math.max(0, MIN_VISIBLE - elapsed);

    setTimeout(() => {
      loader.classList.add('loaded');
      document.documentElement.style.overflow = previousHtml;
      document.body.style.overflow = previousBody;
      setTimeout(() => loader.remove(), 900);
    }, wait);
  }

  function say(message) {
    if (caption) caption.textContent = message;
  }

  return { close, say };
}
