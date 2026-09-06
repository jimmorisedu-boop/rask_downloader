/* Тесты на общие хелперы: именно они решают, что расширение согласится
   скачать и как назовёт файл, поэтому регрессия здесь дороже всего. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const code = fs.readFileSync(new URL('../common.js', import.meta.url), 'utf8');
const RASK = new Function(`${code}\nreturn RASK;`)();

test('isAllowedMediaUrl пропускает медиа с разрешённого домена', () => {
  assert.ok(RASK.isAllowedMediaUrl('https://app.rask.ai/data/abc/def.mp4'));
  assert.ok(RASK.isAllowedMediaUrl('https://app.rask.ai/data/abc/def.mp4?X-Amz-Signature=deadbeef'));
  assert.ok(RASK.isAllowedMediaUrl('https://app.rask.ai/data/x.m4a'));
});

test('isAllowedMediaUrl отклоняет всё остальное', () => {
  const bad = [
    'https://evil.example/x.mp4',
    'https://app.rask.ai.evil.example/x.mp4',
    'https://cdn.app.rask.ai/x.mp4',
    'http://app.rask.ai/x.mp4',
    'https://app.rask.ai/x.exe',
    'https://app.rask.ai/',
    'javascript:alert(1)//x.mp4',
    'blob:https://app.rask.ai/1234',
    'file:///c:/x.mp4',
    '',
    null,
    undefined,
  ];
  for (const url of bad) {
    assert.equal(RASK.isAllowedMediaUrl(url), false, `должно быть отклонено: ${String(url)}`);
  }
});

test('safeName вычищает символы, опасные для файловой системы и cmd', () => {
  assert.equal(RASK.safeName('a/b\\c:d*e?f"g<h>i|j'), 'a_b_c_d_e_f_g_h_i_j');
  // ведущие подчёркивания и точки срезаются, иначе имя выглядит как мусор
  assert.equal(RASK.safeName('%PATH% & calc'), 'PATH_ _ calc');
  assert.equal(RASK.safeName('...точки'), 'точки');
  assert.equal(RASK.safeName('   '), 'rask-video');
  assert.equal(RASK.safeName(''), 'rask-video');
  assert.equal(RASK.safeName(null), 'rask-video');
  assert.ok(RASK.safeName('x'.repeat(500)).length <= 80);
});

test('safeName не оставляет управляющих символов', () => {
  const name = RASK.safeName('про\u0000ект\u001fи\u007fмя');
  assert.equal(name, 'проектимя');
});

test('asciiName оставляет только латиницу, цифры и ._-', () => {
  assert.match(RASK.asciiName('Проект №5 — финал'), /^[A-Za-z0-9._-]+$/);
  assert.equal(RASK.asciiName('My Project v2'), 'My_Project_v2');
  assert.equal(RASK.asciiName('—'), 'rask-video');
  assert.equal(RASK.asciiName(''), 'rask-video');
  assert.ok(RASK.asciiName('x'.repeat(500)).length <= 80);
});

test('MODES перечисляет ровно те режимы, что понимает mux.js', () => {
  assert.deepEqual(RASK.MODES, ['mux', 'only-original', 'only-localized', 'files']);
});
