// ============================================================
// Синхронизация root part1.html/part2.html -> web/public/legacy/*.js
// ============================================================
// Игровая логика живёт в part1.html/part2.html (root, рабочая копия).
// Прод собирается через Vite из web/, а сам геймплей грузится как
// внешний defer-скрипт из web/public/legacy/part*-game.js (см.
// MASTERPLAN.md, Этап 9 — inline <script> в web/part*.html не годится
// из-за порядка выполнения относительно <script type="module">).
//
// Раньше эти два файла держали руками в синхроне — и это уже минимум
// два раза расходилось незамеченным (Этап 19/19.1 — пропала кнопка
// осмотра в бою; и повторно во время правок 2026-08-24 — три строки
// комментария в part2.html не попали в legacy-копию). Теперь легаси-
// файлы генерируются ЭТИМ скриптом из root на каждой сборке
// (package.json: "prebuild") — root остаётся единственным источником
// правды, руками web/public/legacy/*.js больше никто не редактирует.
//
// Запуск вручную (для локальной проверки без полной сборки):
//   node scripts/sync-legacy.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..'); // web/scripts -> web -> repo root

const TARGETS = [
  { src: 'part1.html', dest: 'web/public/legacy/part1-game.js' },
  { src: 'part2.html', dest: 'web/public/legacy/part2-game.js' },
];

// Инлайновый геймплейный <script> — последний в файле, сразу перед
// </body> (в обоих файлах ровно так и устроено: несколько <script
// src="js/...">, а последним — один голый <script> без атрибутов).
const SCRIPT_RE = /<script>\n([\s\S]*?)\n<\/script>\n<\/body>/;

let failed = false;
for (const t of TARGETS) {
  const srcPath = join(ROOT, t.src);
  const destPath = join(ROOT, t.dest);
  const html = readFileSync(srcPath, 'utf8');
  const m = html.match(SCRIPT_RE);
  if (!m) {
    console.error(`[sync-legacy] не нашёл инлайновый <script> перед </body> в ${t.src} — проверь структуру файла, менять generated legacy-файл не стал`);
    failed = true;
    continue;
  }
  writeFileSync(destPath, m[1] + '\n', 'utf8');
  console.log(`[sync-legacy] ${t.src} -> ${t.dest} (${m[1].split('\n').length} строк)`);
}
if (failed) process.exit(1);
