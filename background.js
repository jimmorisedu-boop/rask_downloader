/* Service worker: принимает задание от контент-скрипта, кладёт его в
   session storage и открывает вкладку склейки. Ссылки не попадают ни в
   историю, ни в URL - только в storage.session, который живёт до перезапуска
   браузера. */
'use strict';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'rask-dl:start') return;

  (async () => {
    try {
      const id = 'job-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
      await chrome.storage.session.set({
        [id]: {
          mode: msg.mode,
          original: msg.original,
          localized: msg.localized,
          name: msg.name || 'rask-video',
          createdAt: Date.now(),
        },
      });
      await chrome.tabs.create({
        url: chrome.runtime.getURL('mux.html#' + id),
        index: sender.tab ? sender.tab.index + 1 : undefined,
        active: true,
      });
      sendResponse({ ok: true });
    } catch (err) {
      console.error('[Rask DL]', err);
      sendResponse({ ok: false, error: String(err && err.message || err) });
    }
  })();

  return true; // ответ асинхронный
});
