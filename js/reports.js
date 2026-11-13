import * as api from './api.js';
import { byId, element, on, text } from './dom.js';

const PAGE_SIZE = 20;

const ACTION_LABELS = { create: 'Создание', update: 'Изменение', delete: 'Удаление' };
const ENTITY_LABELS = { node: 'Узел', article: 'Статья' };

const short = (value, length = 60) => {
  const textValue = String(value ?? '');
  if (!textValue) return '—';
  return textValue.length > length ? `${textValue.slice(0, length)}…` : textValue;
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
};

const summarize = (entry) => {
  const changed = entry.changed || {};
  const keys = Object.keys(changed);

  if (entry.action === 'update') {
    if (!keys.length) return 'Без изменений полей.';
    return keys
      .map((key) => {
        const [before, after] = changed[key] || [];
        return `${key}: ${short(before)} → ${short(after)}`;
      })
      .join(' · ');
  }

  if (entry.action === 'delete') return 'Запись удалена.';

  const contentKey = entry.entity_type === 'node' ? 'info' : 'content';
  const content = changed[contentKey]?.[1];
  return content ? `Создан(а). ${short(content, 120)}` : 'Создан(а).';
};

export function createReports({ isAdmin }) {
  let page = 1;
  let total = 0;

  const list = byId('reportsList');
  const status = byId('reportsStatus');
  const pager = byId('reportsPager');

  const currentFilters = () => ({
    entityType: byId('reportsEntity').value,
    dateFrom: byId('reportsFrom').value,
    dateTo: byId('reportsTo').value,
  });

  function renderRows(rows) {
    list.replaceChildren();

    if (!rows.length) {
      list.append(element('p', 'article__empty', 'Изменений пока нет.'));
      return;
    }

    for (const entry of rows) {
      const row = element('article', 'report');

      const head = element('div', 'report__head');
      const badge = element(
        'span',
        `report__badge report__badge--${entry.action}`,
        ACTION_LABELS[entry.action] || entry.action
      );
      const type = element('span', 'report__type', ENTITY_LABELS[entry.entity_type] || entry.entity_type);
      const date = element('time', 'report__date', formatDateTime(entry.created_at));
      head.append(badge, type, date);

      const label = element('h3', 'report__label', entry.label || '—');
      const summary = element('p', 'report__summary', summarize(entry));
      const author = element(
        'p',
        'report__author',
        entry.author_email ? `Автор: ${entry.author_email}` : 'Автор: —'
      );

      row.append(head, label, summary, author);
      list.append(row);
    }
  }

  function renderPager() {
    pager.replaceChildren();
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (pages <= 1) return;

    const prev = element('button', 'btn', '← Назад');
    prev.type = 'button';
    prev.disabled = page <= 1;
    prev.addEventListener('click', () => {
      page -= 1;
      load();
    });

    const label = element('span', 'reports__page', `${page} / ${pages}`);

    const next = element('button', 'btn', 'Вперёд →');
    next.type = 'button';
    next.disabled = page >= pages;
    next.addEventListener('click', () => {
      page += 1;
      load();
    });

    pager.append(prev, label, next);
  }

  async function load() {
    if (!isAdmin()) {
      list.replaceChildren(element('p', 'article__empty', 'Доступно только администратору.'));
      pager.replaceChildren();
      text(status, '');
      return;
    }

    list.replaceChildren(element('p', 'article__empty', 'Загружаю репорты…'));
    text(status, '');

    try {
      const filters = currentFilters();
      const [rows, count] = await Promise.all([
        api.fetchAuditLog({ ...filters, page, pageSize: PAGE_SIZE }),
        api.fetchAuditLogCount(filters),
      ]);

      total = Number(count) || rows.length;
      renderRows(rows);
      renderPager();
    } catch (error) {
      list.replaceChildren(element('p', 'article__empty', `Ошибка загрузки: ${error.message}`));
      pager.replaceChildren();
    }
  }

  on(byId('reportsFilters'), 'submit', (event) => {
    event.preventDefault();
    page = 1;
    load();
  });

  on(byId('reportsReset'), 'click', () => {
    byId('reportsEntity').value = '';
    byId('reportsFrom').value = '';
    byId('reportsTo').value = '';
    page = 1;
    load();
  });

  return { load };
}
