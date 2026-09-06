/* Собирает rask-downloader.zip из того, что лежит в рабочей копии, - чтобы
   архив не расходился с репозиторием (раньше он собирался руками и отставал).
   Кладёт архив рядом с папкой расширения. Запуск: npm run zip

   Пишем zip вручную: внешних зависимостей у проекта нет и заводить их ради
   одного архива не хочется. Даты внутри фиксированные, поэтому одинаковый
   входной набор файлов всегда даёт побайтово одинаковый архив. */
import { deflateRawSync } from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFile = path.resolve(root, '..', 'rask-downloader.zip');
const prefix = 'rask-downloader/';

/** Всё, что попадает в архив: только то, что нужно Chrome, плюс документы. */
const ENTRIES = [
  'manifest.json',
  'common.js',
  'background.js',
  'content.js',
  'mux.html',
  'mux.js',
  'popup.html',
  'popup.js',
  'README.md',
  'LICENSE',
  'icons/16.png',
  'icons/48.png',
  'icons/128.png',
  'vendor/ffmpeg.js',
  'vendor/814.ffmpeg.js',
  'vendor/ffmpeg-core.js',
  'vendor/ffmpeg-core.wasm',
  'vendor/CHECKSUMS.txt',
];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Фиксированная отметка времени: 2020-01-01 00:00:00 в формате MS-DOS.
const DOS_TIME = 0;
const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1;

const files = ENTRIES.map((name) => {
  const full = path.join(root, name);
  if (!fs.existsSync(full)) throw new Error(`нет файла ${name} — архив собирать нечего`);
  const data = fs.readFileSync(full);
  const deflated = deflateRawSync(data, { level: 9 });
  // Если сжатие не помогло (уже сжатые png), кладём как есть.
  const stored = deflated.length >= data.length;
  return {
    name: prefix + name,
    data,
    body: stored ? data : deflated,
    method: stored ? 0 : 8,
    crc: crc32(data),
  };
});

const chunks = [];
let offset = 0;
const central = [];

for (const file of files) {
  const nameBuf = Buffer.from(file.name, 'utf8');

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);      // версия
  local.writeUInt16LE(0x0800, 6);  // имена в UTF-8
  local.writeUInt16LE(file.method, 8);
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(file.crc, 14);
  local.writeUInt32LE(file.body.length, 18);
  local.writeUInt32LE(file.data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);

  chunks.push(local, nameBuf, file.body);

  const dir = Buffer.alloc(46);
  dir.writeUInt32LE(0x02014b50, 0);
  dir.writeUInt16LE(20, 4);        // кем создан
  dir.writeUInt16LE(20, 6);        // минимальная версия
  dir.writeUInt16LE(0x0800, 8);
  dir.writeUInt16LE(file.method, 10);
  dir.writeUInt16LE(DOS_TIME, 12);
  dir.writeUInt16LE(DOS_DATE, 14);
  dir.writeUInt32LE(file.crc, 16);
  dir.writeUInt32LE(file.body.length, 20);
  dir.writeUInt32LE(file.data.length, 24);
  dir.writeUInt16LE(nameBuf.length, 28);
  dir.writeUInt16LE(0, 30);        // extra
  dir.writeUInt16LE(0, 32);        // комментарий
  dir.writeUInt16LE(0, 34);        // диск
  dir.writeUInt16LE(0, 36);        // внутренние атрибуты
  dir.writeUInt32LE(0, 38);        // внешние атрибуты
  dir.writeUInt32LE(offset, 42);
  central.push(Buffer.concat([dir, nameBuf]));

  offset += local.length + nameBuf.length + file.body.length;
}

const centralBuf = Buffer.concat(central);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(0, 4);
eocd.writeUInt16LE(0, 6);
eocd.writeUInt16LE(files.length, 8);
eocd.writeUInt16LE(files.length, 10);
eocd.writeUInt32LE(centralBuf.length, 12);
eocd.writeUInt32LE(offset, 16);
eocd.writeUInt16LE(0, 20);

fs.writeFileSync(outFile, Buffer.concat([...chunks, centralBuf, eocd]));

const size = fs.statSync(outFile).size;
console.log(`${path.relative(process.cwd(), outFile)} — ${files.length} файлов, ${(size / 1048576).toFixed(1)} МБ`);
