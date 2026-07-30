#!/usr/bin/env bash
# ============================================================
#  Сборка apk без Gradle
#  Запускать НА СЕРВЕРЕ:  /opt/magazin/android/build-apk.sh
#
#  Приложение — тонкая оболочка: внутри WebView, который открывает
#  игру с сервера. Поэтому apk почти никогда не надо пересобирать:
#  новая версия игры доезжает до телефона сама. Пересборка нужна
#  только если менялся сам MainActivity, иконка или адрес игры.
#
#  Инструменты берём напрямую (aapt2, javac, d8, zipalign, apksigner) —
#  Gradle тянет за собой полгигабайта зависимостей и лезет в сеть
#  на каждой сборке, а здесь ни одной внешней библиотеки нет.
# ============================================================
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SDK="${ANDROID_SDK_ROOT:-/opt/magazin/android-sdk}"
BT="$SDK/build-tools/34.0.0"
PLATFORM="$SDK/platforms/android-34/android.jar"
OUT="$HERE/build"
KEYSTORE="$HERE/keystore/magazin.keystore"
KS_PASS="${MAGAZIN_KS_PASS:-magazin-abdul}"
APK_FINAL="/opt/magazin/apk/magazin.apk"

log() { echo "[apk] $*"; }
die() { echo "[apk] ОШИБКА: $*" >&2; exit 1; }

[ -x "$BT/aapt2" ]     || die "нет aapt2 — Android SDK не установлен в $SDK"
[ -f "$PLATFORM" ]     || die "нет android.jar"
command -v javac >/dev/null || die "нет javac (нужен JDK 17)"

rm -rf "$OUT"
mkdir -p "$OUT/res" "$OUT/classes" "$OUT/dex" "$OUT/gen" "$(dirname "$APK_FINAL")"

# ---------- 1. ресурсы ----------
log "компилирую ресурсы"
"$BT/aapt2" compile --dir "$HERE/res" -o "$OUT/res.zip"

log "связываю ресурсы и манифест"
"$BT/aapt2" link \
  -o "$OUT/base.apk" \
  -I "$PLATFORM" \
  --manifest "$HERE/AndroidManifest.xml" \
  --java "$OUT/gen" \
  --min-sdk-version 24 \
  --target-sdk-version 34 \
  --version-code 1 \
  --version-name 1.0 \
  "$OUT/res.zip"

# ---------- 2. java ----------
log "компилирую java"
find "$HERE/java" "$OUT/gen" -name '*.java' > "$OUT/sources.txt"
javac -source 17 -target 17 -nowarn \
  -classpath "$PLATFORM" \
  -d "$OUT/classes" \
  @"$OUT/sources.txt" 2>&1 | grep -v "^Note:" || true
[ -n "$(find "$OUT/classes" -name '*.class')" ] || die "javac ничего не собрал"

# ---------- 3. dex ----------
log "перевожу в dex"
find "$OUT/classes" -name '*.class' > "$OUT/classes.txt"
"$BT/d8" --lib "$PLATFORM" --min-api 24 --release \
  --output "$OUT/dex" @"$OUT/classes.txt"
[ -f "$OUT/dex/classes.dex" ] || die "d8 не сделал classes.dex"

# ---------- 4. складываем apk ----------
log "собираю apk"
cp "$OUT/base.apk" "$OUT/unsigned.apk"
( cd "$OUT/dex" && zip -q -X "$OUT/unsigned.apk" classes.dex )

# ---------- 5. выравнивание ----------
log "выравниваю"
rm -f "$OUT/aligned.apk"
"$BT/zipalign" -p -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

# ---------- 6. ключ ----------
if [ ! -f "$KEYSTORE" ]; then
  log "создаю ключ подписи (один раз; хранится в $KEYSTORE)"
  mkdir -p "$(dirname "$KEYSTORE")"
  keytool -genkeypair -v \
    -keystore "$KEYSTORE" -storepass "$KS_PASS" -keypass "$KS_PASS" \
    -alias magazin -keyalg RSA -keysize 2048 -validity 10950 \
    -dname "CN=Zabroshenniy Magazin, OU=Game, O=kentavr34, L=Baku, C=AZ" >/dev/null 2>&1
fi
# ВАЖНО: этот файл терять нельзя. Обновление приложения на телефоне
# проходит, только если новый apk подписан ТЕМ ЖЕ ключом.

# ---------- 7. подпись ----------
log "подписываю"
"$BT/apksigner" sign \
  --ks "$KEYSTORE" --ks-pass "pass:$KS_PASS" --key-pass "pass:$KS_PASS" \
  --ks-key-alias magazin \
  --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true \
  --out "$OUT/magazin.apk" "$OUT/aligned.apk"

# ---------- 8. проверка по факту ----------
# `head` закрывает трубу после N строк раньше, чем aapt2/apksigner
# заканчивают писать — под set -o pipefail это SIGPIPE (код 141),
# скрипт падал ПОСЛЕ успешной сборки, просто не успев скопировать apk.
log "проверяю подпись"
"$BT/apksigner" verify --print-certs "$OUT/magazin.apk" 2>&1 | head -4 || true

"$BT/aapt2" dump badging "$OUT/magazin.apk" 2>&1 | head -3 || true

cp -f "$OUT/magazin.apk" "$APK_FINAL"
# apk должен лежать и внутри выложенной версии, чтобы его можно было скачать
if [ -d /opt/magazin/www ]; then
  cp -f "$APK_FINAL" "$(readlink -f /opt/magazin/www)/magazin.apk"
fi

log "готово: $APK_FINAL ($(du -h "$APK_FINAL" | cut -f1))"
log "скачать: https://magazin.45-67-216-36.sslip.io/magazin.apk"
