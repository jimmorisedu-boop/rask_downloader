/* Проверяет, что vendor/ не подменён: сверяет sha256 с vendor/CHECKSUMS.txt и
   ещё раз убеждается, что в коде не осталось адресов, куда расширение могло бы
   сходить в сеть. Запускается в CI и вручную: npm run vendor:verify */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendorDir = path.join(root, 'vendor');
const allowedUrl = 'https://emscripten.org/docs/compiling/Dynamic-Linking.html';

const checksums = fs.readFileSync(path.join(vendorDir, 'CHECKSUMS.txt'), 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const [hash, name] = line.split(/\s+/);
    return { hash, name };
  });

let failed = 0;

for (const { hash, name } of checksums) {
  const file = path.join(vendorDir, name);
  if (!fs.existsSync(file)) {
    console.error(`ОТСУТСТВУЕТ  ${name}`);
    failed++;
    continue;
  }
  const actual = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (actual === hash) {
    console.log(`ok  ${name}`);
  } else {
    console.error(`НЕ СОВПАЛА СУММА  ${name}\n  ожидалось ${hash}\n  получено  ${actual}`);
    failed++;
  }
}

const listed = new Set(checksums.map((c) => c.name).concat('CHECKSUMS.txt'));
for (const name of fs.readdirSync(vendorDir)) {
  if (!listed.has(name)) {
    console.error(`ЛИШНИЙ ФАЙЛ  vendor/${name} — его нет в CHECKSUMS.txt`);
    failed++;
  }
}

for (const { name } of checksums.filter((c) => c.name.endsWith('.js'))) {
  const file = path.join(vendorDir, name);
  if (!fs.existsSync(file)) continue;
  const code = fs.readFileSync(file, 'utf8');
  const urls = [...new Set((code.match(/https?:\/\/[^\s"'`)]+/g) || []))].filter((u) => u !== allowedUrl);
  if (urls.length) {
    console.error(`ВНЕШНИЕ АДРЕСА  vendor/${name}: ${urls.join(', ')}`);
    failed++;
  }
}

if (failed) {
  console.error(`\nvendor/ не прошёл проверку (${failed}). Пересобери: npm run vendor:build`);
  process.exit(1);
}
console.log('\nvendor/ соответствует CHECKSUMS.txt и не содержит внешних адресов.');
