/* ============================================================
   PROGRESS — метки и счётчики прохождения
   ------------------------------------------------------------
   Не путать с SAVE самой части: это не точка возврата в игре,
   а данные системы уровней — "часть I пройдена", "дошёл до
   этажа 3" и так далее. Хранится через тот же Profile, слот 0,
   поэтому работает офлайн и синхронизируется между устройствами
   так же, как обычный прогресс.

   Значения только РАСТУТ. Если с двух устройств пришли разные
   цифры для одного ключа — побеждает большая (флаг true побеждает
   false, этаж 3 побеждает этаж 1). Так прогресс никогда не
   откатывается назад, с какого бы устройства ни зашёл игрок.
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

  /* "Больше" — это true > false, и большее число > меньшего. */
  function moreAdvanced(a, b) {
    if (a === undefined) return b;
    if (b === undefined) return a;
    if (typeof a === 'number' || typeof b === 'number') return Math.max(Number(a) || 0, Number(b) || 0);
    return !!(a || b);
  }

  var Progress = {};

  /* Быстрый неблокирующий ответ из локального кэша — чтобы страница
     не мигала "заблокировано" на время, пока идёт запрос к серверу. */
  Progress.getValueSync = function (key) { return readCache()[key]; };
  Progress.isCompleteSync = function (key) { return !!readCache()[key]; };

  Progress.setValue = function (key, value, cb) {
    var flags = readCache();
    var merged = moreAdvanced(flags[key], value);
    if (flags[key] === merged) { if (cb) cb(true); return; }   /* не стало новее — сеть не дёргаем */
    flags[key] = merged;
    writeCache(flags);
    if (!global.Profile) { if (cb) cb(true); return; }
    global.Profile.save(0, flags, function (r) { if (cb) cb(!!r.ok); });
  };

  Progress.markComplete = function (key, cb) { Progress.setValue(key, true, cb); };

  Progress.refresh = function (cb) {
    cb = cb || function () { };
    if (!global.Profile) return cb(readCache());
    global.Profile.load(0, function (data) {
      var cloud = data && typeof data === 'object' ? data : {};
      var local = readCache();
      var merged = {};
      Object.keys(cloud).concat(Object.keys(local)).forEach(function (k) {
        merged[k] = moreAdvanced(local[k], cloud[k]);
      });
      writeCache(merged);
      cb(merged);
    });
  };

  global.Progress = Progress;
})(window);

/* ---------- мост для Vite: тот же объект, что и window.Progress ----------
   Легаси-скрипты (part1/part2 пока не модульные) продолжают видеть
   window.Progress без изменений; сборка получает то же самое через import. */
export const Progress = window.Progress;
