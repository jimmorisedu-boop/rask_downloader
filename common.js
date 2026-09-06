/* Общие константы и хелперы. Подключается во все три контекста расширения:
   в контент-скрипт (через manifest.content_scripts.js), в service worker
   (через importScripts) и во вкладку склейки (через <script> в mux.html).
   Всё, что нужно менять при переезде Rask на другой домен, лежит здесь. */
'use strict';

const RASK = (() => {
  /** Единственный источник правды о том, откуда расширению можно качать.
      Должен совпадать с host_permissions и content_scripts.matches в манифесте. */
  const ALLOWED_ORIGIN = 'https://app.rask.ai';

  /** Задания старше этого срока считаются мусором и вычищаются из session storage. */
  const JOB_TTL_MS = 6 * 60 * 60 * 1000;

  const JOB_PREFIX = 'job-';
  const MODES = ['mux', 'only-original', 'only-localized', 'files'];
  const MEDIA_EXT = /\.(mp4|m4a|mov|webm)$/i;

  function parseUrl(value) {
    try {
      return new URL(String(value));
    } catch (_) {
      return null;
    }
  }

  /** Ссылка на медиафайл на разрешённом домене — единственное, что мы готовы
      скачивать. Проверяется и в контент-скрипте, и в SW, и во вкладке склейки:
      каждый из трёх контекстов не доверяет предыдущему. */
  function isAllowedMediaUrl(value) {
    const url = parseUrl(value);
    return !!url && url.origin === ALLOWED_ORIGIN && MEDIA_EXT.test(url.pathname);
  }

  /** Origin ссылки для текста ошибки; путь и подпись наружу не показываем. */
  function originOf(value) {
    const url = parseUrl(value);
    return url ? url.origin : 'неизвестный адрес';
  }

  /** Имя файла: убираем всё, что ломает файловые системы или интерпретируется
      командной оболочкой (имя попадает в .bat из режима «два файла»). */
  function safeName(name) {
    const cleaned = String(name || '')
      .replace(/[\u0000-\u001f\u007f]+/g, '')
      .replace(/[\\/:*?"<>|&%^!`;,'()[\]{}=$]+/g, '_')
      .replace(/\s+/g, ' ')
      .slice(0, 80)
      .replace(/^[.\s_-]+/, '')
      .replace(/[.\s_-]+$/, '')
      .trim();
    return cleaned || 'rask-video';
  }

  /** Имя для режима с .bat: только ASCII. cmd.exe читает скрипт в кодировке
      консоли (обычно cp866), поэтому кириллица в путях внутри .bat не сработает
      — файлы кладём на диск под тем же ASCII-именем, что стоит в скрипте. */
  function asciiName(name) {
    const cleaned = safeName(name)
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^[._-]+/, '')
      .replace(/[._-]+$/, '')
      .slice(0, 80);
    return cleaned || 'rask-video';
  }

  return {
    ALLOWED_ORIGIN,
    JOB_TTL_MS,
    JOB_PREFIX,
    MODES,
    isAllowedMediaUrl,
    originOf,
    safeName,
    asciiName,
  };
})();

if (typeof globalThis !== 'undefined') globalThis.RASK = RASK;
