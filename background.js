/* Service worker: принимает задание от контент-скрипта, кладёт его в
   session storage и открывает вкладку склейки. Ссылки не попадают ни в
   историю, ни в URL - только в storage.session, который живёт до перезапуска
   браузера.

   Задание принимается, только если оно пришло из вкладки на разрешённом
   домене и обе ссылки ведут туда же: контент-скрипт читает DOM чужой страницы,
   поэтому его данным здесь не доверяют. */
'use strict';

importScripts('common.js');

const TAB_PREFIX = RASK.ALLOWED_ORIGIN + '/';

/** Убирает задания, которые остались от закрытых или упавших вкладок склейки.
    Внутри лежат подписанные ссылки, поэтому висеть до перезапуска браузера им
    незачем. */
async function purgeStaleJobs() {
  try {
    const all = await chrome.storage.session.get(null);
    const now = Date.now();
    const stale = Object.keys(all).filter((key) => {
      if (!key.startsWith(RASK.JOB_PREFIX)) return false;
      const job = all[key];
      return !job || typeof job.createdAt !== 'number' || now - job.createdAt > RASK.JOB_TTL_MS;
    });
    if (stale.length) await chrome.storage.session.remove(stale);
    return stale.length;
  } catch (err) {
    console.error('[Rask DL] не удалось вычистить старые задания', err);
    return 0;
  }
}

chrome.runtime.onStartup.addListener(purgeStaleJobs);
chrome.runtime.onInstalled.addListener(purgeStaleJobs);

/** Проверяет задание целиком - и отправителя, и содержимое. */
function validate(msg, sender) {
  const from = sender && sender.tab && sender.tab.url;
  if (!from || !from.startsWith(TAB_PREFIX)) {
    throw new Error('Задание пришло не со страницы ' + RASK.ALLOWED_ORIGIN + ' - отклонено.');
  }
  if (!RASK.MODES.includes(msg.mode)) {
    throw new Error('Неизвестный режим: ' + String(msg.mode));
  }
  for (const url of [msg.original, msg.localized]) {
    if (!RASK.isAllowedMediaUrl(url)) {
      throw new Error(
        'Ссылка ведёт на ' + RASK.originOf(url) + ', а расширение работает только с ' +
        RASK.ALLOWED_ORIGIN + ' - отклонено.'
      );
    }
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'rask-dl:start') return;

  (async () => {
    try {
      validate(msg, sender);
      await purgeStaleJobs();

      const id = RASK.JOB_PREFIX + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
      await chrome.storage.session.set({
        [id]: {
          mode: msg.mode,
          original: msg.original,
          localized: msg.localized,
          name: RASK.safeName(msg.name),
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
      sendResponse({ ok: false, error: String((err && err.message) || err) });
    }
  })();

  return true; // ответ асинхронный
});
