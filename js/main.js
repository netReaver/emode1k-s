import { ROOT_ID } from './config.js';
import * as api from './api.js';
import { byId, debounce, element, on, show, text } from './dom.js';
import { GraphView } from './graph.js';
import { createAdmin } from './admin.js';
import { createRouter } from './pages.js';
import { bootLoader } from './loader.js';

const loader = bootLoader();

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });
};

const excerptOf = (content, length = 160) => {
  const text = String(content || '').replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length).trimEnd()}…` : text;
};

function showNode(node) {
  text(byId('detailsTitle'), node.label);
  text(byId('details'), node.info || 'Описание не добавлено.');
  show(byId('adminNodeActions'), admin.isAdmin() && node.id !== ROOT_ID);
  loadRelated(node.id);
}

async function loadRelated(nodeId) {
  const list = byId('relatedList');
  list.replaceChildren(element('p', 'related__empty', 'Загружаю статьи…'));

  try {
    const articles = await api.fetchRelatedArticles(nodeId);
    list.replaceChildren();

    if (!articles.length) {
      list.append(element('p', 'related__empty', 'Пока нет связанных статей.'));
      return;
    }

    for (const article of articles) {
      const item = element('article', 'related__item');
      item.tabIndex = 0;
      const open = () => router.go('articles');
      item.addEventListener('click', open);
      item.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      });

      const title = element('h4', 'related__item-title', article.title);
      const date = element('time', 'related__item-date', formatDate(article.updatedAt));
      const excerpt = element('p', 'related__item-text', excerptOf(article.content));

      item.append(title, date, excerpt);
      list.append(item);
    }
  } catch (error) {
    list.replaceChildren(element('p', 'related__empty', `Ошибка загрузки: ${error.message}`));
  }
}

const graph = new GraphView({
  host: byId('graph'),
  stage: byId('graphStage'),
  canvas: byId('sparkCanvas'),
  onSelect: showNode,
});

const router = createRouter({
  onEnter: (route) => {
    if (route === 'articles') admin.loadArticles();
    if (route === 'settings') admin.loadSettings();
  },
});

const admin = createAdmin({
  graph,
  reloadTree: loadTree,
  navigate: (route) => router.go(route),
});

/* ---------- загрузка дерева ---------- */

async function loadTree() {
  graph.setMessage('');
  graph.setLoading(true);
  graph.render();
  text(byId('details'), 'Загружаю дерево…');

  let nodes;

  try {
    nodes = await api.fetchNodes();
  } catch (error) {
    graph.setLoading(false);
    graph.setMessage(`Не удалось загрузить дерево: ${error.message}`);
    graph.render();
    text(byId('detailsTitle'), 'Ошибка загрузки');
    text(byId('details'), error.message);
    return;
  }

  graph.setLoading(false);
  graph.setNodes(nodes);

  if (!nodes.some((node) => node.id === ROOT_ID)) {
    graph.setMessage('В базе нет корневого узла emode1k.');
    graph.render();
    return;
  }

  const target = graph.index.byId.has(graph.selectedId) ? graph.selectedId : ROOT_ID;
  graph.select(target);
}

/* ---------- меню ---------- */

const menuButton = byId('menuButton');
const siteMenu = byId('siteMenu');

function setMenu(open) {
  menuButton.setAttribute('aria-expanded', String(open));
  siteMenu.classList.toggle('open', open);
  siteMenu.inert = !open;
}

on(menuButton, 'click', () => {
  setMenu(menuButton.getAttribute('aria-expanded') !== 'true');
});

on(siteMenu, 'click', (event) => {
  const target = event.target.closest('[data-page]');
  if (target) {
    setMenu(false);
    router.go(target.dataset.page);
  }
});

on(byId('menuLogoutButton'), 'click', () => {
  setMenu(false);
  if (admin.isAdmin()) admin.logout();
  else admin.openLogin();
});

/* ---------- поиск ---------- */

on(byId('search'), 'input', debounce((event) => {
  graph.setQuery(event.target.value.trim());
}, 140));

/* ---------- связь ---------- */

const contactPanel = byId('contactPanel');
const contactButton = byId('contactButton');

function setContact(open) {
  show(contactPanel, open);
  contactButton.setAttribute('aria-expanded', String(open));
}

on(contactButton, 'click', () => {
  const open = contactPanel.classList.contains('hidden');
  setContact(open);
  if (open) byId('contactText').focus();
});

on(byId('contactForm'), 'submit', (event) => {
  event.preventDefault();

  const body = encodeURIComponent(byId('contactText').value.trim());
  location.href = `mailto:emode1koff@gmail.com?subject=${encodeURIComponent('Письмо с сайта emode1k')}&body=${body}`;
});

if (byId('footerYear')) byId('footerYear').textContent = String(new Date().getFullYear());

/* ---------- общие клики ---------- */

on(document, 'click', (event) => {
  if (!event.target.closest('.topbar__brand')) setMenu(false);
  if (!event.target.closest('.contact')) setContact(false);
});

on(document, 'keydown', (event) => {
  if (event.key !== 'Escape') return;

  setMenu(false);
  setContact(false);
  show(byId('loginDialog'), false);
});

/* ---------- старт ---------- */

async function start() {
  try {
    api.connect();
    api.watchAuth((session) => admin.setAdmin(api.isAdminSession(session)));

    const session = await api.currentSession();
    admin.setAdmin(api.isAdminSession(session));
  } catch (error) {
    graph.setMessage(`Нет связи с базой: ${error.message}`);
  }

  await admin.loadSettings();
  await loadTree();
}

(async () => {
  try {
    await start();
  } catch (error) {
    console.error(error);
    graph.setMessage(`Сбой запуска: ${error.message}`);
    graph.render();
  } finally {
    loader.close();
  }
})();
