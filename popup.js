'use strict';

(async () => {
  const el = document.getElementById('status');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const onRask = tab && tab.url && tab.url.startsWith('https://app.rask.ai/');
    if (onRask) {
      el.textContent = 'Вкладка Rask открыта — панель должна быть справа внизу.';
      el.classList.add('on');
    } else {
      el.textContent = 'Открой страницу проекта на app.rask.ai, чтобы появилась кнопка.';
    }
  } catch (err) {
    el.textContent = String((err && err.message) || err);
  }
})();
