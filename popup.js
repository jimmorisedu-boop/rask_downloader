'use strict';

(async () => {
  const el = document.getElementById('status');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    // tab.url виден без разрешения "tabs" только потому, что у расширения есть
    // host_permissions на этот адрес; для чужих вкладок здесь будет undefined.
    const onRask = !!(tab && tab.url && tab.url.startsWith(RASK.ALLOWED_ORIGIN + '/'));
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
