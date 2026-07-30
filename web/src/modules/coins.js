/* ============================================================
   COINS — монеты за задачи (принцип GTA: сделал дело — награда сразу)
   ------------------------------------------------------------
   Отдельно от Progress: Progress копит метки, которые только растут
   (этаж, флаги прохождения). Монеты — это КОШЕЛЁК, его можно и
   потратить, поэтому здесь простое "кто записал последним, тот
   и прав" (slot 3 через тот же Profile), а не логика "больше значит
   новее". Для одиночной игры с редкой синхронизацией между
   устройствами этого достаточно.
   ============================================================ */
(function (global) {
  'use strict';

  var CACHE_KEY = 'magazin_coins_cache';
  var balance = 0;
  var hudEl = null;
  var onChange = null;

  function readCache() {
    try { return Math.max(0, parseInt(localStorage.getItem(CACHE_KEY) || '0', 10) || 0); }
    catch (e) { return 0; }
  }
  function writeCache(v) {
    try { localStorage.setItem(CACHE_KEY, String(v)); } catch (e) { }
  }
  balance = readCache();

  var Coins = {};

  Coins.get = function () { return balance; };

  function persist(cb) {
    writeCache(balance);
    renderHUD();
    if (onChange) try { onChange(balance); } catch (e) { }
    if (!global.Profile) { if (cb) cb(true); return; }
    global.Profile.save(3, { balance: balance }, function (r) { if (cb) cb(!!r.ok); });
  }

  /* Награда за конкретное действие — не за время и не за случайность.
     "why" только для всплывающей подписи, в хранилище не попадает. */
  Coins.earn = function (amount, why, cb) {
    if (!amount || amount <= 0) { if (cb) cb(true); return; }
    balance += amount;
    persist(cb);
    Coins.popup('+' + amount + (why ? ' — ' + why : ''), true);
  };

  Coins.spend = function (amount, why, cb) {
    if (amount > balance) { if (cb) cb(false); return false; }
    balance -= amount;
    persist(cb);
    Coins.popup('-' + amount + (why ? ' — ' + why : ''), false);
    return true;
  };

  Coins.refresh = function (cb) {
    cb = cb || function () { };
    if (!global.Profile) return cb(balance);
    global.Profile.load(3, function (data) {
      if (data && typeof data.balance === 'number' && data.balance >= 0) {
        balance = data.balance; writeCache(balance); renderHUD();
        if (onChange) try { onChange(balance); } catch (e) { }
      }
      cb(balance);
    });
  };

  Coins.onChange = function (fn) { onChange = fn; };

  /* ---------- HUD: маленький счётчик в углу ---------- */
  function ensureHud() {
    if (hudEl) return hudEl;
    hudEl = document.createElement('div');
    hudEl.id = 'coins-hud';
    hudEl.setAttribute('style',
      'position:fixed;top:10px;left:10px;z-index:96;' +
      "font-family:'Courier New',monospace;font-size:13px;letter-spacing:2px;" +
      'color:#f0d060;background:rgba(12,12,18,.6);padding:5px 10px;' +
      'border:1px solid rgba(240,208,96,.35);pointer-events:none;');
    document.body.appendChild(hudEl);
    return hudEl;
  }
  function renderHUD() {
    ensureHud().textContent = '🪙 ' + balance;
  }

  var popupQueue = null;
  Coins.popup = function (text, positive) {
    try {
      var p = document.createElement('div');
      p.textContent = text;
      p.setAttribute('style',
        'position:fixed;top:38px;left:10px;z-index:96;' +
        "font-family:'Courier New',monospace;font-size:11px;letter-spacing:1px;" +
        'color:' + (positive ? '#a8d8b4' : '#d88a8a') + ';' +
        'opacity:0;transition:opacity .3s,transform .3s;transform:translateY(4px);' +
        'pointer-events:none;');
      document.body.appendChild(p);
      requestAnimationFrame(function () { p.style.opacity = '1'; p.style.transform = 'translateY(0)'; });
      setTimeout(function () {
        p.style.opacity = '0';
        setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 350);
      }, 1400);
    } catch (e) { }
  };

  renderHUD();
  global.Coins = Coins;
})(window);

/* ---------- мост для Vite: тот же объект, что и window.Coins ----------
   Легаси-скрипты (part1/part2 пока не модульные) продолжают видеть
   window.Coins без изменений; сборка получает то же самое через import. */
export const Coins = window.Coins;
