import { ROOT_ID } from './config.js';
import * as api from './api.js';
import { byId, element, on, show, text } from './dom.js';
import { descendantsOf, depthOf } from './layout.js';
import { applySettings, settingsFromForm, settingsIntoForm } from './theme.js';

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });
};

export function createAdmin({ graph, reloadTree, navigate }) {
  let isAdmin = false;
  let editingNode = null;
  let editingArticle = null;
  let articles = [];

  /* ---------- доступ ---------- */

  function setAdmin(enabled) {
    isAdmin = enabled;
    document.body.dataset.role = enabled ? 'admin' : 'guest';
    document.body.classList.toggle('admin-mode', enabled);

    show(byId('adminPanel'), enabled);
    show(byId('adminNodeActions'), enabled && graph.selectedId !== ROOT_ID);
    show(byId('articleEditor'), enabled);
    show(byId('settingsGate'), !enabled);
    show(byId('menuReportsButton'), enabled);

    text(byId('menuLogoutButton'), enabled ? 'Выйти из профиля' : 'Войти');

    const form = byId('settingsForm');
    for (const field of form.querySelectorAll('input, select')) field.disabled = !enabled;
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.classList.toggle('hidden', !enabled);

    if (!enabled) {
      resetNodeForm();
      resetArticleForm();
    }

    graph.render();
    if (document.body.dataset.page === 'articles') renderArticles();
  }

  function openLogin() {
    show(byId('loginDialog'), true);
    text(byId('loginStatus'), '');
    byId('emailInput').value = '';
    byId('passwordInput').value = '';
    byId('emailInput').focus();
  }

  function closeLogin() {
    show(byId('loginDialog'), false);
    byId('loginForm').reset();
    text(byId('loginStatus'), '');
  }

  async function handleLogin(event) {
    event.preventDefault();

    const button = byId('loginForm').querySelector('button[type="submit"]');
    button.disabled = true;
    text(byId('loginStatus'), '');

    try {
      const session = await api.signIn(byId('emailInput').value.trim(), byId('passwordInput').value);

      if (!api.isAdminSession(session)) {
        await api.signOut();
        text(byId('loginStatus'), 'У этой учётной записи нет прав администратора.');
        return;
      }

      closeLogin();
      setAdmin(true);
    } catch (error) {
      text(byId('loginStatus'), error.message);
    } finally {
      button.disabled = false;
    }
  }

  async function handleLogout() {
    try {
      await api.signOut();
      setAdmin(false);
      text(byId('adminStatus'), '');
    } catch (error) {
      text(byId('adminStatus'), error.message);
    }
  }

  /* ---------- узлы ---------- */

  function resetNodeForm() {
    editingNode = null;
    byId('nodeForm').reset();
    text(byId('nodeFormTitle'), 'Новый узел');
    text(byId('saveNodeButton'), 'Добавить');
    show(byId('cancelNodeButton'), false);
  }

  async function submitNode(event) {
    event.preventDefault();
    if (!isAdmin) return;

    const label = byId('nodeLabel').value.trim();
    const info = byId('nodeInfo').value.trim();
    const button = byId('saveNodeButton');

    if (!label) {
      text(byId('adminStatus'), 'Нужно название.');
      return;
    }

    button.disabled = true;
    let savedId = editingNode;

    try {
      if (editingNode) {
        await api.updateNode(editingNode, { label, info });
      } else {
        savedId = `node-${crypto.randomUUID()}`;
        const parent = graph.index.byId.has(graph.selectedId) ? graph.selectedId : ROOT_ID;
        await api.insertNode({ id: savedId, parent, label, info });
      }

      resetNodeForm();
      await reloadTree();
      if (savedId) graph.select(savedId);
      text(byId('adminStatus'), 'Сохранено.');
    } catch (error) {
      text(byId('adminStatus'), error.message);
    } finally {
      button.disabled = false;
    }
  }

  function startEditNode() {
    const node = graph.index.byId.get(graph.selectedId);
    if (!isAdmin || !node || node.id === ROOT_ID) return;

    editingNode = node.id;
    byId('nodeLabel').value = node.label;
    byId('nodeInfo').value = node.info || '';
    text(byId('nodeFormTitle'), 'Правка узла');
    text(byId('saveNodeButton'), 'Сохранить');
    show(byId('cancelNodeButton'), true);
    byId('nodeLabel').focus();
  }

  async function removeBranch() {
    const node = graph.index.byId.get(graph.selectedId);
    if (!isAdmin || !node || node.id === ROOT_ID) return;
    if (!confirm(`Удалить «${node.label}» вместе с вложенными узлами?`)) return;

    const ids = [...descendantsOf(node.id, graph.index)];
    const ordered = ids.sort((a, b) => {
      const first = graph.index.byId.get(a);
      const second = graph.index.byId.get(b);
      return depthOf(second || { id: b }, graph.index) - depthOf(first || { id: a }, graph.index);
    });

    try {
      for (const id of ordered) {
        await api.deleteNodes([id]);
        graph.expanded.delete(id);
      }

      graph.selectedId = ROOT_ID;
      await reloadTree();
      graph.select(ROOT_ID);
      text(byId('adminStatus'), 'Ветка удалена.');
    } catch (error) {
      text(byId('adminStatus'), error.message);
    }
  }

  /* ---------- статьи ---------- */

  function resetArticleForm() {
    editingArticle = null;
    byId('articleForm').reset();
    text(byId('articleFormHeading'), 'Новая статья');
    text(byId('saveArticleButton'), 'Опубликовать');
    show(byId('cancelArticleButton'), false);
  }

  function populateNodeSelect() {
    const select = byId('articleNodes');
    if (!select) return;

    const nodes = [...graph.nodes].sort((a, b) => a.label.localeCompare(b.label, 'ru'));
    select.replaceChildren();

    for (const node of nodes) {
      const option = element('option', '', node.label);
      option.value = node.id;
      select.append(option);
    }
  }

  function renderArticles() {
    const list = byId('articlesList');
    list.replaceChildren();

    if (!articles.length) {
      list.append(element('p', 'article__empty', 'Статей пока нет.'));
      return;
    }

    for (const article of articles) {
      const card = element('article', 'article');

      const title = element('h2', 'article__title', article.title);
      const date = element('p', 'article__date', formatDate(article.updatedAt));
      const body = element('p', 'article__text', article.content);

      card.append(title);
      if (date.textContent) card.append(date);
      card.append(body);

      if (isAdmin) {
        const actions = element('div', 'actions');

        const edit = element('button', 'btn', 'Изменить');
        edit.type = 'button';
        edit.addEventListener('click', async () => {
          editingArticle = article.id;
          byId('articleTitle').value = article.title;
          byId('articleContent').value = article.content;
          text(byId('articleFormHeading'), 'Правка статьи');
          text(byId('saveArticleButton'), 'Сохранить');
          show(byId('cancelArticleButton'), true);

          const select = byId('articleNodes');
          try {
            const links = await api.fetchArticleLinks(article.id);
            [...select.options].forEach((option) => {
              option.selected = links.includes(option.value);
            });
          } catch {
            [...select.options].forEach((option) => { option.selected = false; });
          }

          window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        const remove = element('button', 'btn btn--danger', 'Удалить');
        remove.type = 'button';
        remove.addEventListener('click', async () => {
          if (!confirm(`Удалить «${article.title}»?`)) return;

          try {
            await api.deleteArticle(article.id);
            await loadArticles();
          } catch (error) {
            text(byId('articleStatus'), error.message);
          }
        });

        actions.append(edit, remove);
        card.append(actions);
      }

      list.append(card);
    }
  }

  async function loadArticles() {
    populateNodeSelect();
    const list = byId('articlesList');
    list.replaceChildren(element('p', 'article__empty', 'Загружаю статьи…'));

    try {
      articles = await api.fetchArticles();
      renderArticles();
    } catch (error) {
      list.replaceChildren(element('p', 'article__empty', `Ошибка загрузки: ${error.message}`));
    }
  }

  async function submitArticle(event) {
    event.preventDefault();
    if (!isAdmin) return;

    const title = byId('articleTitle').value.trim();
    const content = byId('articleContent').value.trim();
    const nodeIds = [...byId('articleNodes').selectedOptions].map((option) => option.value);

    if (!title || !content) {
      text(byId('articleStatus'), 'Нужны заголовок и текст.');
      return;
    }

    let savedId = editingArticle;

    try {
      if (editingArticle) {
        await api.updateArticle(editingArticle, { title, content });
      } else {
        savedId = `article-${crypto.randomUUID()}`;
        await api.insertArticle({ id: savedId, title, content });
      }

      await api.setArticleLinks(savedId, nodeIds);

      resetArticleForm();
      text(byId('articleStatus'), 'Статья сохранена.');
      await loadArticles();
    } catch (error) {
      text(byId('articleStatus'), error.message);
    }
  }

  /* ---------- настройки ---------- */

  async function loadSettings() {
    try {
      const settings = await api.fetchSettings();
      applySettings(settings);
      settingsIntoForm(settings);
      return settings;
    } catch (error) {
      text(byId('settingsStatus'), `Ошибка загрузки: ${error.message}`);
      return null;
    }
  }

  async function submitSettings(event) {
    event.preventDefault();
    if (!isAdmin) return;

    const settings = settingsFromForm();

    try {
      await api.saveSettings(settings);
      applySettings(settings);
      text(byId('settingsStatus'), 'Сохранено для всех посетителей.');
    } catch (error) {
      text(byId('settingsStatus'), `Ошибка сохранения: ${error.message}`);
    }
  }

  function bindSettingsPreview() {
    on(byId('pageScale'), 'input', (event) => {
      byId('pageScaleOutput').value = `${event.target.value}%`;
      document.documentElement.style.setProperty('--page-scale', Number(event.target.value) / 100);
    });

    on(byId('brightness'), 'input', (event) => {
      byId('brightnessOutput').value = `${event.target.value}%`;
      document.documentElement.style.setProperty('--brightness', Number(event.target.value) / 100);
    });

    on(byId('colorSelect'), 'input', (event) => {
      document.documentElement.style.setProperty('--accent', event.target.value);
    });

    on(byId('themeSelect'), 'change', (event) => {
      document.body.classList.toggle('theme-gothic', event.target.value === 'gothic');
    });

    on(byId('animationsEnabled'), 'change', (event) => {
      document.body.classList.toggle('animations-off', !event.target.checked);
    });
  }

  /* ---------- связка ---------- */

  on(byId('loginForm'), 'submit', handleLogin);
  on(byId('closeLoginButton'), 'click', closeLogin);
  on(byId('loginDialog'), 'click', (event) => {
    if (event.target === byId('loginDialog')) closeLogin();
  });

  on(byId('nodeForm'), 'submit', submitNode);
  on(byId('cancelNodeButton'), 'click', resetNodeForm);
  on(byId('editNodeButton'), 'click', startEditNode);
  on(byId('deleteNodeButton'), 'click', removeBranch);

  on(byId('articleForm'), 'submit', submitArticle);
  on(byId('cancelArticleButton'), 'click', resetArticleForm);

  on(byId('settingsForm'), 'submit', submitSettings);
  bindSettingsPreview();

  document.querySelectorAll('[data-back]').forEach((button) => {
    on(button, 'click', () => navigate('tree'));
  });

  return {
    setAdmin,
    openLogin,
    logout: handleLogout,
    loadArticles,
    loadSettings,
    renderArticles,
    isAdmin: () => isAdmin,
  };
}
