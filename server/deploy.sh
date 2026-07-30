#!/usr/bin/env bash
# ============================================================
#  Выкладка новой версии игры
#  Запускать НА СЕРВЕРЕ:  /opt/magazin/deploy.sh
#
#  С Этапа 9 игра собирается через Vite (папка web/ в репозитории),
#  а не раздаётся как есть. На хосте нет npm — сборка идёт в
#  одноразовом Docker-контейнере node:24-alpine (тот же образ,
#  что уже используется под magazin-api), ничего лишнего на хост
#  не ставится.
#
#  Что делает:
#    1. забирает свежий код из GitHub во временную папку;
#    2. собирает web/ в одноразовом контейнере node → web/dist/;
#    3. проставляет номер сборки в version.json и в sw.js;
#    4. проверяет, что все обязательные файлы на месте;
#    5. АТОМАРНО переставляет символическую ссылку www.
#       Игрок в этот момент либо видит старую версию, либо новую —
#       промежуточного состояния с половиной файлов не бывает.
#    6. Старые версии остаются рядом: откат — одна команда.
#
#  Откат:   /opt/magazin/deploy.sh rollback
#
#  Режимы:
#    deploy.sh          — взять код из GitHub (обычная работа)
#    deploy.sh local    — взять код, уже загруженный в /opt/magazin/.staging
#                         (нужно, пока репозиторий на GitHub недоступен)
#    deploy.sh rollback — вернуться на предыдущую версию
# ============================================================
set -euo pipefail

ROOT=/opt/magazin
REPO_URL="${MAGAZIN_REPO:-https://github.com/kentavr34/magazin.git}"
BRANCH="${MAGAZIN_BRANCH:-main}"
RELEASES="$ROOT/releases"
BUILD_IMAGE="node:24-alpine"
KEEP=5

log() { echo "[$(date '+%F %T')] $*"; }
die() { echo "[$(date '+%F %T')] ОШИБКА: $*" >&2; exit 1; }

# ---------- откат ----------
if [ "${1:-}" = "rollback" ]; then
  prev=$(ls -1dt "$RELEASES"/*/ 2>/dev/null | sed -n 2p) || true
  [ -n "${prev:-}" ] || die "откатываться не на что — версия всего одна"
  ln -sfn "releases/$(basename "${prev%/}")" "$ROOT/www.tmp"
  mv -Tf "$ROOT/www.tmp" "$ROOT/www"
  log "откатились на $(basename "${prev%/}")"
  exit 0
fi

BUILD="$(date -u '+%Y%m%d-%H%M%S')"
DEST="$RELEASES/$BUILD"
mkdir -p "$RELEASES"

if [ "${1:-}" = "local" ]; then
  [ -d "$ROOT/.staging" ] || die "нет папки $ROOT/.staging — сначала загрузите туда файлы"
  log "сборка $BUILD — беру код из $ROOT/.staging (загружен вручную)"
  cd "$ROOT/.staging"
  COMMIT="local"
else
  log "сборка $BUILD — забираю код из $REPO_URL ($BRANCH)"
  rm -rf "$ROOT/.staging"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$ROOT/.staging" >/dev/null 2>&1 \
    || die "не смог склонировать репозиторий (нет доступа или нет ветки $BRANCH)"
  cd "$ROOT/.staging"
  COMMIT=$(git rev-parse --short HEAD)
  rm -rf .git
fi

# ---------- сборка web/ в одноразовом контейнере ----------
[ -d web ] || die "в репозитории нет папки web/ — нечего собирать"
log "собираю web/ в контейнере $BUILD_IMAGE (npm ci && npm run build)"
docker run --rm \
  -v "$ROOT/.staging/web:/app" \
  -w /app \
  "$BUILD_IMAGE" \
  sh -c "npm ci --no-audit --no-fund --silent && npm run build" \
  || die "сборка Vite упала — смотри вывод выше"
[ -d web/dist ] || die "web/dist не появился после сборки"
[ -s web/dist/index.html ] || die "web/dist/index.html пуст или отсутствует"

cd web/dist

# ---------- номер сборки ----------
cat > version.json <<JSON
{
  "build": "$BUILD",
  "commit": "$COMMIT",
  "date": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
}
JSON

# sw.js носит номер сборки в имени кэша: сменился номер —
# старый кэш сносится целиком, недоеденных остатков не остаётся.
[ -f sw.js ] || die "нет sw.js в web/dist (проверь web/public/sw.js)"
sed -i "s/__BUILD__/$BUILD/" sw.js
# Пишем именно через if: `grep && die` при set -e роняет скрипт как раз
# в удачном случае, когда grep ничего не нашёл.
if grep -q "__BUILD__" sw.js; then die "номер сборки не подставился в sw.js"; fi

# ---------- проверка комплектности ----------
for f in index.html part1.html part2.html sw.js version.json manifest.webmanifest \
         legacy/part1-game.js legacy/part2-game.js \
         icons/icon-192.png icons/icon-512.png; do
  [ -s "$f" ] || die "в сборке нет файла $f (или он пустой) — выкладка отменена"
done
# three.js собирается Vite в отдельный чанк с хэшем в имени —
# точное имя заранее не известно, ищем по шаблону.
three_chunk=$(ls assets/vendor-three-*.js 2>/dev/null | head -1)
[ -n "$three_chunk" ] || die "не найден чанк vendor-three-*.js — three.js не попал в сборку"
[ "$(stat -c%s "$three_chunk")" -gt 400000 ] || die "$three_chunk подозрительно мал"

# APK, если он уже собран, переносим из прошлой версии — он живёт отдельно
if [ -f "$ROOT/apk/magazin.apk" ]; then
  cp "$ROOT/apk/magazin.apk" ./magazin.apk
fi

# ---------- атомарная подмена ----------
mkdir -p "$DEST"
cp -a . "$DEST/"
cd "$ROOT"
rm -rf "$ROOT/.staging"
# Ссылка ОТНОСИТЕЛЬНАЯ. Контейнеру примонтирована вся папка /opt/magazin,
# и он разбирает ссылку у себя внутри при каждом запросе. Абсолютная ссылка
# внутри контейнера никуда бы не вела, а перемонтировать том на каждой
# выкладке — значит останавливать контейнер.
ln -sfn "releases/$BUILD" "$ROOT/www.tmp"
mv -Tf "$ROOT/www.tmp" "$ROOT/www"
log "www → releases/$BUILD"

# ---------- проверка по факту ----------
docker compose -f "$ROOT/docker-compose.yml" up -d >/dev/null 2>&1 || true
sleep 2
got=$(curl -fsS http://127.0.0.1:8091/version.json | tr -d ' \n')
echo "$got" | grep -q "$BUILD" || die "сервер отдаёт не ту сборку: $got"
curl -fsS -o /dev/null http://127.0.0.1:8091/part1.html || die "part1.html не отдаётся"
curl -fsS -o /dev/null http://127.0.0.1:8091/part2.html || die "part2.html не отдаётся"
curl -fsS -o /dev/null "http://127.0.0.1:8091/$three_chunk" || die "three.js-чанк не отдаётся"
log "проверено: сборка $BUILD ($COMMIT) отдаётся"

# ---------- чистка старых ----------
ls -1dt "$RELEASES"/*/ 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
  log "убираю старую версию $(basename "${old%/}")"
  rm -rf "$old"
done

log "готово. Игра: https://magazin.45-67-216-36.sslip.io/"
