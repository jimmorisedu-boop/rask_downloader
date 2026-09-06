/* Rask Downloader - content script.
   Живёт на app.rask.ai, находит MP4 для Original и Localized и отдаёт их
   странице склейки (mux.html), которая мержит их через ffmpeg.wasm. */
(() => {
  'use strict';

  const TAG = '[Rask DL]';
  const log = (...a) => console.log(TAG, ...a);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Подписи переключателя дорожек - интерфейс Rask бывает на разных языках.
  const RE_ORIGINAL = [/^original$/i, /^оригинал/i, /^исходн/i];
  const RE_LOCALIZED = [/^localized$/i, /^локализ/i, /^dubbed$/i, /^дубл/i, /^перевод/i];
  const matches = (text, list) => list.some((re) => re.test(text));

  /** Кеш найденной пары кнопок и подтверждённого человеком соответствия.
     Объявлены здесь, потому что их читает findToggle() выше по файлу. */
  let toggleCache = null;
  let confirmedOrigIndex = null;
  let pendingAction = null;

  const srcOf = (v) => v.currentSrc || v.getAttribute('src') || v.src || '';
  const isMedia = (u) => RASK.isAllowedMediaUrl(u);

  // ---------------------------------------------------------------- поиск DOM

  function findVideo() {
    const vids = [...document.querySelectorAll('video')];
    return vids.find((v) => isMedia(srcOf(v))) || vids[0] || null;
  }

  /** Запасной поиск: группа ровно из двух соседних кнопок рядом с <video>.
      Обходим только кнопки, а не все элементы поддерева - tick() зовёт это
      часто, а на странице Rask узлов много. */
  function findToggleByShape(video) {
    let node = video.parentElement;
    for (let depth = 0; depth < 8 && node; depth++, node = node.parentElement) {
      const seen = new Set();
      const groups = [];
      for (const btn of node.querySelectorAll('button')) {
        const parent = btn.parentElement;
        if (!parent || seen.has(parent)) continue;
        seen.add(parent);
        const kids = parent.children;
        if (kids.length === 2 && kids[0].tagName === 'BUTTON' && kids[1].tagName === 'BUTTON') {
          groups.push(parent);
        }
      }
      if (groups.length === 1) {
        // Порядок кнопок неизвестен: какая из них Original, спросим у человека.
        return { orig: groups[0].children[0], loc: groups[0].children[1], guessed: true };
      }
    }
    return null;
  }

  /** Пара кнопок Original / Localized над таймлайном плеера.
      guessed === true означает, что подписи распознать не удалось и пара
      взята по расположению - в этом случае соответствие подтверждает человек. */
  function findToggle() {
    if (toggleCache && document.contains(toggleCache.orig) && document.contains(toggleCache.loc)) {
      return toggleCache;
    }
    toggleCache = null;
    confirmedOrigIndex = null;

    const btns = [...document.querySelectorAll('button, [role="tab"], [role="radio"]')];
    const orig = btns.find((b) => matches(b.textContent.trim(), RE_ORIGINAL));
    const loc = btns.find((b) => matches(b.textContent.trim(), RE_LOCALIZED));
    if (orig && loc && orig !== loc) {
      toggleCache = { orig, loc, guessed: false };
      return toggleCache;
    }

    const video = findVideo();
    if (video) toggleCache = findToggleByShape(video);
    return toggleCache;
  }

  /** Имя проекта для файла: хлебные крошки / заголовок / id из URL. */
  function projectName() {
    const bad = /^(rask|share|export|original|localized|open editor)$/i;
    const cand = [...document.querySelectorAll('h1, h2, [class*="readcrumb"] a, nav a')]
      .map((e) => e.textContent.trim())
      .filter((t) => t.length > 2 && t.length < 90 && !bad.test(t));
    const id = (location.pathname.match(/\/project\/([0-9a-f]{8})/i) || [])[1] || 'video';
    return RASK.safeName(cand[0] || ('rask-' + id));
  }

  // ------------------------------------------------------- определение дорожек

  /** Кликает по кнопке дорожки и возвращает URL, который встал в video. */
  async function selectAndRead(video, btn, timeout = 4000) {
    const before = srcOf(video);
    btn.click();
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      await sleep(120);
      const now = srcOf(video);
      if (now && now !== before && isMedia(now)) {
        await sleep(150); // дать React дорисовать
        return srcOf(video);
      }
    }
    return srcOf(video); // дорожка уже была активна - src не менялся
  }

  /** Возвращает { original, localized } - прямые ссылки на два MP4. */
  async function resolveSources(status) {
    const video = findVideo();
    if (!video) throw new Error('Плеер не найден. Открой страницу проекта с видео.');
    const toggle = findToggle();
    if (!toggle) throw new Error('Не найден переключатель Original / Localized.');

    // Если пара найдена по расположению, соответствие подтверждает человек:
    // взять кнопки в произвольном порядке значит рискнуть собрать файл наоборот.
    if (toggle.guessed && confirmedOrigIndex === null) {
      throw new Error('Сначала подтверди, какая кнопка Original.');
    }
    const origBtn = toggle.guessed && confirmedOrigIndex === 1 ? toggle.loc : toggle.orig;
    const locBtn = origBtn === toggle.orig ? toggle.loc : toggle.orig;

    const initial = srcOf(video);
    const wasPaused = video.paused;
    const at = video.currentTime;
    try { video.pause(); } catch (_) {}

    status('Читаю дорожку Original...');
    const original = await selectAndRead(video, origBtn);
    status('Читаю дорожку Localized...');
    const localized = await selectAndRead(video, locBtn);

    // Вернуть плеер в исходное состояние.
    if (initial && localized !== initial) {
      const back = original === initial ? origBtn : locBtn;
      back.click();
      await sleep(200);
    }
    try {
      video.currentTime = at;
      if (!wasPaused) video.play().catch(() => {});
    } catch (_) {}

    for (const url of [original, localized]) {
      if (isMedia(url)) continue;
      if (/^https?:/i.test(url)) {
        throw new Error(
          'Плеер отдал ссылку на ' + RASK.originOf(url) + ', а расширение работает только с ' +
          RASK.ALLOWED_ORIGIN + '.'
        );
      }
      throw new Error('Не удалось прочитать ссылки на видео. Нажми Play в плеере и попробуй снова.');
    }
    if (original === localized) {
      throw new Error('Original и Localized дали одну ссылку - переключатель не сработал.');
    }
    log('original', new URL(original).pathname, '| localized', new URL(localized).pathname);
    return { original, localized };
  }

  // -------------------------------------------------------------------- UI

  const CSS = [
    ':host { all: initial; }',
    '.wrap { position: fixed; right: 20px; bottom: 20px; z-index: 2147483000;',
    '  font: 500 13px/1.4 -apple-system, "Segoe UI", Roboto, sans-serif; color: #fff;',
    '  display: flex; flex-direction: column; gap: 8px; width: 262px; }',
    '.card { background: #17161c; border: 1px solid #2e2c38; border-radius: 14px;',
    '  box-shadow: 0 10px 34px rgba(0,0,0,.42); padding: 12px;',
    '  display: flex; flex-direction: column; gap: 9px; }',
    '.title { font-size: 11px; letter-spacing: .04em; text-transform: uppercase; color: #8e8a9e; }',
    'button.act { all: unset; box-sizing: border-box; cursor: pointer; text-align: center;',
    '  background: #6c4cf1; color: #fff; border-radius: 9px; padding: 10px 12px;',
    '  font-weight: 600; font-size: 13px; transition: background .15s; }',
    'button.act:hover { background: #7d61f5; }',
    'button.act[disabled] { background: #3a3548; color: #9b96ab; cursor: default; }',
    'button.ghost { all: unset; box-sizing: border-box; cursor: pointer; text-align: center;',
    '  border: 1px solid #35323f; border-radius: 9px; padding: 7px 10px; font-size: 12px; color: #b9b5c6;',
    '  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    'button.ghost:hover { border-color: #504a63; color: #fff; }',
    'button.ghost[disabled] { opacity: .5; cursor: default; }',
    '.row { display: flex; gap: 6px; }',
    '.row > button { flex: 1; min-width: 0; }',
    '.status { font-size: 11.5px; color: #a9a4b8; min-height: 15px; }',
    '.status.err { color: #ff8c8c; }',
    '.hint { font-size: 11px; color: #6f6b7d; }',
    '.fold { display: none; flex-direction: column; gap: 6px; }',
    '.fold.open { display: flex; }',
    '.ask { display: none; flex-direction: column; gap: 6px; padding: 9px 10px;',
    '  border: 1px solid #4a4160; border-radius: 10px; background: #1d1a28; }',
    '.ask.open { display: flex; }',
    '.ask .q { font-size: 11.5px; color: #cfc9e0; }',
    'button.mini { all: unset; cursor: pointer; font-size: 11px; color: #7d7890; text-align: center; }',
    'button.mini:hover { color: #b9b5c6; }',
  ].join('\n');

  const MARKUP = [
    '<div class="card">',
    '  <div class="title">Rask Downloader</div>',
    '  <button class="act" data-a="mux">Скачать видео</button>',
    '  <div class="hint">Картинка из Original, звук из Localized</div>',
    '  <div class="ask">',
    '    <div class="q">Подписи кнопок не распознаны. Какая из них Original?</div>',
    '    <div class="row">',
    '      <button class="ghost" data-a="pick-0"></button>',
    '      <button class="ghost" data-a="pick-1"></button>',
    '    </div>',
    '  </div>',
    '  <div class="status"></div>',
    '  <button class="mini" data-a="more">Другие варианты</button>',
    '  <div class="fold">',
    '    <div class="row">',
    '      <button class="ghost" data-a="only-original">Только Original</button>',
    '      <button class="ghost" data-a="only-localized">Только Localized</button>',
    '    </div>',
    '    <button class="ghost" data-a="files">Два файла + .bat для ffmpeg</button>',
    '  </div>',
    '</div>',
  ].join('\n');

  let host, root, ui;
  let busyNow = false;

  function buildPanel() {
    host = document.createElement('div');
    host.id = 'rask-dl-root';
    root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CSS;
    const wrap = document.createElement('div');
    wrap.className = 'wrap';
    wrap.innerHTML = MARKUP;
    root.append(style, wrap);
    document.documentElement.appendChild(host);

    ui = {
      status: root.querySelector('.status'),
      fold: root.querySelector('.fold'),
      ask: root.querySelector('.ask'),
      pick: [root.querySelector('[data-a="pick-0"]'), root.querySelector('[data-a="pick-1"]')],
    };
    root.addEventListener('click', onClick);
    root.addEventListener('mouseover', onPickHover);
    root.addEventListener('mouseout', onPickHover);
  }

  function setStatus(text, isError) {
    if (!ui) return;
    ui.status.textContent = text || '';
    ui.status.classList.toggle('err', !!isError);
  }

  function busy(on) {
    busyNow = on;
    root.querySelectorAll('button.act, button.ghost').forEach((b) => { b.disabled = on; });
  }

  /** Показывает вопрос «какая кнопка Original», подписав варианты их же текстом. */
  function askWhichIsOriginal(toggle, action) {
    const labels = [toggle.orig, toggle.loc].map((btn, i) => btn.textContent.trim() || 'Кнопка ' + (i + 1));
    ui.pick.forEach((btn, i) => { btn.textContent = labels[i]; btn.title = labels[i]; });
    ui.ask.classList.add('open');
    pendingAction = action;
    setStatus('Подтверди соответствие кнопок - иначе видео и звук можно перепутать.');
  }

  /** Подсветка настоящей кнопки плеера, пока курсор на варианте выбора. */
  function onPickHover(e) {
    const btn = e.target && e.target.closest && e.target.closest('[data-a^="pick-"]');
    if (!btn || !toggleCache) return;
    const target = btn.dataset.a === 'pick-0' ? toggleCache.orig : toggleCache.loc;
    if (!target) return;
    target.style.outline = e.type === 'mouseover' ? '2px solid #6c4cf1' : '';
    target.style.outlineOffset = e.type === 'mouseover' ? '2px' : '';
  }

  async function onClick(e) {
    const btn = e.target && e.target.closest && e.target.closest('[data-a]');
    const action = btn && btn.dataset.a;
    if (!action) return;

    if (action === 'more') { ui.fold.classList.toggle('open'); return; }

    if (action === 'pick-0' || action === 'pick-1') {
      confirmedOrigIndex = action === 'pick-1' ? 1 : 0;
      ui.ask.classList.remove('open');
      if (toggleCache) {
        toggleCache.orig.style.outline = '';
        toggleCache.loc.style.outline = '';
      }
      const next = pendingAction;
      pendingAction = null;
      setStatus('');
      if (next) await run(next);
      return;
    }

    await run(action);
  }

  async function run(action) {
    const toggle = findToggle();
    if (!toggle) { setStatus('Не найден переключатель Original / Localized.', true); return; }
    if (toggle.guessed && confirmedOrigIndex === null) { askWhichIsOriginal(toggle, action); return; }

    busy(true);
    setStatus('');
    try {
      const src = await resolveSources(setStatus);
      setStatus('Открываю окно склейки...');
      const res = await chrome.runtime.sendMessage({
        type: 'rask-dl:start',
        mode: action, // mux | only-original | only-localized | files
        original: src.original,
        localized: src.localized,
        name: projectName(),
      });
      if (res && res.ok) setStatus('Готово - смотри новую вкладку.');
      else setStatus((res && res.error) || 'Не удалось запустить склейку.', true);
    } catch (err) {
      console.error(TAG, err);
      setStatus(err.message || String(err), true);
    } finally {
      busy(false);
    }
  }

  // ------------------------------------------------------------ подключение

  let mounted = false;

  function tick() {
    // Пока идёт работа, панель не трогаем: resolveSources сам перещёлкивает
    // плеер, из-за чего React перерисовывает поддерево и ready ненадолго врёт.
    if (busyNow) {
      if (mounted && host && !document.documentElement.contains(host)) {
        document.documentElement.appendChild(host);
      }
      return;
    }
    const ready = !!findVideo() && !!findToggle();
    if (ready && !mounted) { buildPanel(); mounted = true; log('панель добавлена'); }
    else if (!ready && mounted) { if (host) host.remove(); mounted = false; ui = null; }
    else if (mounted && !document.documentElement.contains(host)) {
      document.documentElement.appendChild(host);
    }
  }

  let timer = null;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(tick, 400);
  }).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(() => { if (!document.hidden) tick(); }, 2000);
  tick();
})();
