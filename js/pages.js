import { byId, show } from './dom.js';

const ROUTES = {
  tree: 'treePage',
  articles: 'articlesPage',
  settings: 'settingsPage',
  reports: 'reportsPage',
};

export function createRouter({ onEnter } = {}) {
  let current = 'tree';

  function go(route) {
    const target = ROUTES[route] ? route : 'tree';
    current = target;
    document.body.dataset.page = target;

    for (const [name, id] of Object.entries(ROUTES)) {
      show(byId(id), name === target);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
    onEnter?.(target);
  }

  return {
    go,
    current: () => current,
  };
}
