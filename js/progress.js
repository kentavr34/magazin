/* ============================================================
   PROGRESS — метки прохождения ("часть I пройдена" и т.п.)
   ------------------------------------------------------------
   Отдельно от SAVE самой части: это не точка возврата в игре,
   а флаг для системы уровней — на нём держится "прошёл первое,
   открылось следующее". Хранится через тот же Profile, слот 0,
   поэтому работает офлайн и синхронизируется между устройствами
   так же, как обычный прогресс.
   ============================================================ */
(function (global) {
  'use strict';

  var CACHE_KEY = 'magazin_progress_cache';
  var cache = null;

  function readCache() {
    if (cache) return cache;
    try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); }
    catch (e) { cache = {}; }
    return cache;
  }
  function writeCache(v) {
    cache = v;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(v)); } catch (e) { }
  }

  var Progress = {};

  /* Быстрый неблокирующий ответ из локального кэша — чтобы страница
     не мигала "заблокировано" на время, пока идёт запрос к серверу. */
  Progress.isCompleteSync = function (key) {
    return !!readCache()[key];
  };

  Progress.markComplete = function (key, cb) {
    var flags = readCache();
    if (flags[key]) { if (cb) cb(true); return; }     /* уже отмечено — не дёргаем сеть повторно */
    flags[key] = true;
    writeCache(flags);
    if (!global.Profile) { if (cb) cb(true); return; }
    global.Profile.save(0, flags, function (r) { if (cb) cb(!!r.ok); });
  };

  Progress.refresh = function (cb) {
    cb = cb || function () { };
    if (!global.Profile) return cb(readCache());
    global.Profile.load(0, function (data) {
      var flags = data && typeof data === 'object' ? data : {};
      /* Локальные отметки не теряем, даже если облако ещё не в курсе —
         иначе быстрый переход между вкладками мог бы откатить разблокировку. */
      var merged = Object.assign({}, flags, readCache());
      writeCache(merged);
      cb(merged);
    });
  };

  global.Progress = Progress;
})(window);
