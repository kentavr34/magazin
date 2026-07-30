/* ============================================================
   Service Worker — офлайн-кэш и авто-обновление
   Строка BUILD подставляется скриптом сборки (server/build.sh).
   Правило простое:
     HTML  — сначала сеть (свежая игра), кэш только если сети нет;
     файлы — сначала кэш (быстрый старт), обновление фоном.
   При смене BUILD все старые кэши сносятся целиком.
   ============================================================ */
var BUILD = '__BUILD__';
var CACHE = 'magazin-' + BUILD;

/* То, без чего игра не запустится офлайн. */
var CORE = [
  './',
  './index.html',
  './part1.html',
  './part2.html',
  './vendor/three.min.js',
  './js/profile.js',
  './js/progress.js',
  './js/coins.js',
  './js/inventory.js',
  './js/mapview.js',
  './js/detail.js',
  './js/controls.js',
  './js/updater.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      /* addAll падает целиком, если хоть один файл не отдался.
         Кладём поштучно: одна опечатка в списке не должна ломать установку. */
      return Promise.all(CORE.map(function (u) {
        return c.add(new Request(u, { cache: 'reload' })).catch(function () { });
      }));
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('message', function (e) {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
  if (e.data === 'GET_BUILD' && e.source) e.source.postMessage({ build: BUILD });
});

function isHTML(req) {
  return req.mode === 'navigate' ||
    (req.headers.get('accept') || '').indexOf('text/html') !== -1;
}

/* Сеть с ограничением по времени: на плохом мобильном интернете
   игра не должна висеть белым экраном — через 4 секунды берём кэш. */
function netFirst(req) {
  return new Promise(function (resolve) {
    var done = false;
    var timer = setTimeout(function () {
      if (done) return;
      caches.match(req).then(function (r) { if (r && !done) { done = true; resolve(r); } });
    }, 4000);

    fetch(req).then(function (res) {
      clearTimeout(timer);
      if (done) return;
      done = true;
      if (res && res.ok && res.type === 'basic') {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      resolve(res);
    }).catch(function () {
      clearTimeout(timer);
      if (done) return;
      caches.match(req).then(function (r) {
        if (done) return;
        done = true;
        resolve(r || caches.match('./index.html').then(function (i) {
          return i || new Response('Нет сети', { status: 503 });
        }));
      });
    });
  });
}

function cacheFirst(req) {
  return caches.match(req).then(function (hit) {
    var net = fetch(req).then(function (res) {
      if (res && res.ok && res.type === 'basic') {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () { return hit; });
    return hit || net;
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;   /* чужие домены не трогаем */

  /* version.json — всегда только из сети и без кэша,
     иначе игра никогда не узнает, что вышла новая версия. */
  if (url.pathname.indexOf('version.json') !== -1) {
    e.respondWith(fetch(req, { cache: 'no-store' }).catch(function () {
      return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
    }));
    return;
  }

  e.respondWith(isHTML(req) ? netFirst(req) : cacheFirst(req));
});
