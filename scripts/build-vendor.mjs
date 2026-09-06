/* Пересобирает vendor/ из npm и применяет обе правки, без которых расширение
   лезло бы в сеть или сыпало 404 в DevTools:

   1. дефолтная ссылка на ядро в 814.ffmpeg.js меняется с unpkg на локальную;
   2. вырезаются комментарии sourceMappingURL - .map-файлы в поставку не входят.

   После копирования пересчитываются контрольные суммы в vendor/CHECKSUMS.txt.
   Запуск: npm run vendor:build */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const spec = JSON.parse(fs.readFileSync(path.join(root, 'scripts/vendor.json'), 'utf8'));
const vendorDir = path.join(root, 'vendor');

const wanted = Object.entries(spec.packages).map(([name, version]) => `${name}@${version}`);
console.log('npm install --no-save', wanted.join(' '));
execFileSync('npm', ['install', '--no-save', '--no-audit', '--no-fund', ...wanted], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

fs.mkdirSync(vendorDir, { recursive: true });

for (const file of spec.files) {
  const src = path.join(root, 'node_modules', file.from);
  const dst = path.join(vendorDir, file.to);
  if (!fs.existsSync(src)) throw new Error(`нет файла ${src} — проверь версии в scripts/vendor.json`);

  if (file.to.endsWith('.js')) {
    let code = fs.readFileSync(src, 'utf8');
    const before = code;

    // (1) ядро берём только из папки расширения
    code = code.replace(/https?:\/\/unpkg\.com\/@ffmpeg\/core[^"']*/g, './ffmpeg-core.js');
    // (2) карты кода в поставку не входят
    code = code.replace(/\n?\/\/# sourceMappingURL=.*$/gm, '');

    if (file.to === '814.ffmpeg.js' && code === before && /unpkg/.test(before)) {
      throw new Error('814.ffmpeg.js: ссылка на unpkg не заменилась, проверь шаблон правки');
    }
    fs.writeFileSync(dst, code);
  } else {
    fs.copyFileSync(src, dst);
  }
  console.log('  ->', path.relative(root, dst));
}

// Страховка: в поставке не должно остаться ни одного адреса, куда можно сходить.
const allowedUrl = 'https://emscripten.org/docs/compiling/Dynamic-Linking.html';
for (const file of spec.files.filter((f) => f.to.endsWith('.js'))) {
  const code = fs.readFileSync(path.join(vendorDir, file.to), 'utf8');
  const urls = (code.match(/https?:\/\/[^\s"'`)]+/g) || []).filter((u) => u !== allowedUrl);
  if (urls.length) throw new Error(`${file.to}: остались внешние адреса: ${[...new Set(urls)].join(', ')}`);
}

const lines = spec.files
  .map((f) => f.to)
  .sort()
  .map((name) => {
    const hash = createHash('sha256').update(fs.readFileSync(path.join(vendorDir, name))).digest('hex');
    return `${hash}  ${name}`;
  });
fs.writeFileSync(path.join(vendorDir, 'CHECKSUMS.txt'), lines.join('\n') + '\n');
console.log('\nvendor/CHECKSUMS.txt обновлён:\n' + lines.join('\n'));
