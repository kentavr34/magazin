/* ============================================================
   Авто-обновление игры
   ------------------------------------------------------------
   Что делает:
     1. регистрирует service worker (офлайн + кэш);
     2. раз в 3 минуты и при возврате на вкладку спрашивает
        version.json — не вышла ли новая сборка;
     3. если игрок в меню — обновляет сам, молча;
        если идёт игра — показывает полоску «обновить», чтобы
        не сбросить прохождение в неподходящий момент.

   Аварийный выход: открыть адрес с ?nosw=1 — снимет service worker
   и вычистит кэш. На случай, если обновление всё-таки застрянет.
   ============================================================ */
(function () {
  'use strict';

  var CHECK_MS = 3 * 60 * 1000;
  var myBuild = null;
  var banner = null;
  var busy = false;

  function inGame() {
    return !!(window.MAGAZIN_IN_GAME);
  }

  /* ---------- аварийное снятие ---------- */
  if (location.search.indexOf('nosw=1') !== -1) {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function (rs) {
        rs.forEach(function (r) { r.unregister(); });
      });
    }
    if (window.caches) {
      caches.keys().then(function (ks) { ks.forEach(function (k) { caches.delete(k); }); });
    }
    return;
  }

  /* ---------- регистрация ---------- */
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        /* новая версия скачалась в фоне */
        reg.addEventListener('updatefound', function () {
          var sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', function () {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) offer(reg);
          });
        });
        setInterval(function () { reg.update().catch(noop); }, CHECK_MS);
      }).catch(noop);

      var reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (reloading) return;
        reloading = true;
        location.reload();
      });
    });
  }

  /* ---------- опрос version.json ---------- */
  function check() {
    if (busy || !navigator.onLine) return;
    busy = true;
    fetch('version.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (v) {
        busy = false;
        if (!v || !v.build) return;
        if (myBuild === null) { myBuild = v.build; return; }
        if (v.build !== myBuild) {
          myBuild = v.build;
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistration().then(function (reg) {
              if (reg) reg.update().catch(noop); else hardReload();
            });
          } else hardReload();
        }
      })
      .catch(function () { busy = false; });
  }

  function hardReload() {
    if (inGame()) { showBanner(hardReload); return; }
    location.reload();
  }

  /* ---------- применить обновление ---------- */
  function offer(reg) {
    var apply = function () {
      if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING');
      else location.reload();
    };
    if (inGame()) showBanner(apply); else apply();
  }

  function showBanner(apply) {
    if (banner) return;
    banner = document.createElement('div');
    banner.setAttribute('style',
      'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:99999;' +
      'background:rgba(12,12,18,.95);color:#e4e0d6;border:2px solid #c9a227;' +
      "padding:10px 14px;font-family:'Courier New',monospace;font-size:12px;" +
      'letter-spacing:2px;display:flex;gap:12px;align-items:center;' +
      'box-shadow:0 0 24px rgba(0,0,0,.6);max-width:92vw;');
    var t = document.createElement('span');
    t.textContent = 'ВЫШЛА НОВАЯ ВЕРСИЯ';
    var b = document.createElement('button');
    b.textContent = 'ОБНОВИТЬ';
    b.setAttribute('style',
      'background:#c9a227;color:#101014;border:0;padding:7px 12px;cursor:pointer;' +
      "font-family:'Courier New',monospace;font-size:12px;letter-spacing:2px;");
    b.onclick = apply;
    var x = document.createElement('button');
    x.textContent = '✕';
    x.setAttribute('style',
      'background:transparent;color:#8a8578;border:0;cursor:pointer;font-size:14px;');
    x.onclick = function () { banner.remove(); banner = null; };
    banner.appendChild(t); banner.appendChild(b); banner.appendChild(x);
    document.body.appendChild(banner);
  }

  function noop() { }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) check();
  });
  window.addEventListener('online', check);
  check();
  setInterval(check, CHECK_MS);

  window.MAGAZIN_UPDATER = { check: check, build: function () { return myBuild; } };
})();

/* ---------- мост для Vite: тот же объект, что и window.MAGAZIN_UPDATER ----------
   Легаси-скрипты (part1/part2 пока не модульные) продолжают видеть
   window.MAGAZIN_UPDATER без изменений; сборка получает то же самое через import. */
export const MAGAZIN_UPDATER = window.MAGAZIN_UPDATER;
