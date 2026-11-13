import { byId, element, on } from './dom.js';

const QUICK_REPLIES = ['Не работает сайт', 'Ошибка / баг', 'Вопрос по контенту', 'Другое'];

/**
 * Лёгкий бот поддержки на state machine:
 *   greeting → (выбор варианта или свободный ввод) → предложение связаться с разработчиком.
 * Никаких внешних LLM API.
 */
export function createSupport({ openDeveloper }) {
  const log = byId('chatLog');
  const form = byId('chatForm');
  const input = byId('chatInput');
  let answered = false;

  const scroll = () => {
    log.scrollTop = log.scrollHeight;
  };

  function botMessage(...nodes) {
    const bubble = element('div', 'chat__msg chat__msg--bot');
    bubble.append(...nodes);
    log.append(bubble);
    scroll();
  }

  function userMessage(text) {
    const bubble = element('div', 'chat__msg chat__msg--user');
    bubble.append(element('span', 'chat__text', text));
    log.append(bubble);
    scroll();
  }

  function greeting() {
    botMessage(element('p', 'chat__text', 'Что случилось? Выберите вариант или опишите проблему своими словами.'));

    const replies = element('div', 'chat__replies');
    for (const label of QUICK_REPLIES) {
      const reply = element('button', 'chat__reply', label);
      reply.type = 'button';
      reply.addEventListener('click', () => answer(label));
      replies.append(reply);
    }
    botMessage(replies);
  }

  function answer(text) {
    if (answered) return;
    answered = true;

    userMessage(text);
    botMessage(element('p', 'chat__text', 'Спасибо! Если нужна помощь — напишите разработчику напрямую.'));

    const actions = element('div', 'chat__actions');
    const contact = element('button', 'btn btn--primary', 'Связаться с разработчиком');
    contact.type = 'button';
    contact.addEventListener('click', () => openDeveloper());
    actions.append(contact);
    botMessage(actions);
  }

  on(form, 'submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    answer(text);
  });

  return {
    reset() {
      answered = false;
      log.replaceChildren();
      greeting();
    },
  };
}
