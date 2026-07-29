#!/usr/bin/env bash
# ============================================================
#  Автоматическое подтягивание новой версии с GitHub
#  Ставится в cron и запускается раз в две минуты.
#
#  Смысл: Абдул и Кенан делают push в репозиторий — и всё.
#  Через пару минут сервер сам забирает изменения и выкладывает их,
#  а ещё через пару минут игра на телефонах сама переходит
#  на новую сборку. Никаких ключей и секретов на GitHub не нужно:
#  сервер сам ходит за кодом, а не GitHub ломится на сервер.
#
#  Если в новой версии чего-то не хватает, deploy.sh откажется её
#  выкладывать, и на сервере останется прежняя рабочая игра.
# ============================================================
set -euo pipefail

ROOT=/opt/magazin
REPO_URL="${MAGAZIN_REPO:-https://github.com/kentavr34/magazin.git}"
BRANCH="${MAGAZIN_BRANCH:-main}"
STAMP="$ROOT/.last-commit"
LOG="$ROOT/autopull.log"

exec >>"$LOG" 2>&1
say() { echo "[$(date '+%F %T')] $*"; }

# Один экземпляр за раз: две выкладки одновременно — это гарантированная каша.
exec 9>"$ROOT/.autopull.lock"
flock -n 9 || exit 0

remote=$(git ls-remote "$REPO_URL" "refs/heads/$BRANCH" 2>/dev/null | cut -f1 || true)
if [ -z "$remote" ]; then
  say "репозиторий недоступен ($REPO_URL, ветка $BRANCH) — пропускаю"
  exit 0
fi

last=$(cat "$STAMP" 2>/dev/null || echo "")
[ "$remote" = "$last" ] && exit 0

say "новый коммит ${remote:0:8} (было ${last:0:8}) — выкладываю"
if "$ROOT/deploy.sh"; then
  echo "$remote" > "$STAMP"
  say "выложено"
else
  say "ВЫКЛАДКА НЕ УДАЛАСЬ — на сервере осталась прежняя версия"
fi

# лог не должен разрастаться
tail -n 500 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
