/* ============================================================
   ADMIN — панель отладки/читов, покупается в магазине за монеты
   ------------------------------------------------------------
   В отличие от магазина скинов (js/inventory.js — там принципиально
   "только косметика"), это осознанное исключение: разовая дорогая
   покупка (10000 монет), после которой игрок может включить
   бессмертие, ноклип/полёт, ускорение, высокий прыжок и увеличить
   врагов. Если из-за ноклипа игрок пролетит мимо непройденного
   сюжетного триггера — это ожидаемо и ничем не гасится: играющий
   сам выбрал сломать себе прохождение.

   Владение — через Progress (растущий флаг 'shop_admin'), как и
   скины. Сами переключатели (god/noclip/множители) — локальные
   настройки устройства в localStorage, не синхронизируются как
   прогресс: это не часть истории, а личная настройка чита.

   Подключается в part1.html И part2.html (обеим нужен только
   Progress — Coins/Inventory для чтения флага не требуются).
   Всё как обычно: window.ADMIN && ADMIN.xxx, нет модуля — нет чита.
   ============================================================ */
(function (global) {
  'use strict';

  var LS_STATE = 'magazin_admin_state';
  var FLAG = 'shop_admin';
  var PRICE = 10000;

  var DEFAULT_STATE = { god: false, noclip: false, speed: 1, jump: 1, mob: 1 };
  var st = loadState();

  function loadState() {
    try {
      var raw = localStorage.getItem(LS_STATE);
      if (!raw) return clone(DEFAULT_STATE);
      var o = JSON.parse(raw);
      return {
        god: !!o.god, noclip: !!o.noclip,
        speed: clampNum(o.speed, 1, 5, 1),
        jump: clampNum(o.jump, 1, 5, 1),
        mob: clampNum(o.mob, 0.5, 4, 1)
      };
    } catch (e) { return clone(DEFAULT_STATE); }
  }
  function clone(o) { return { god: o.god, noclip: o.noclip, speed: o.speed, jump: o.jump, mob: o.mob }; }
  function clampNum(v, lo, hi, dflt) { v = parseFloat(v); if (isNaN(v)) return dflt; return Math.max(lo, Math.min(hi, v)); }
  function save() { try { localStorage.setItem(LS_STATE, JSON.stringify(st)); } catch (e) { } }

  var A = {};

  A.isUnlocked = function () { return !!(global.Progress && Progress.isCompleteSync(FLAG)); };
  A.price = PRICE;

  /* Покупка — вызывается из магазина (js/inventory.js), требует Coins.
     Условие "обе части + обе секретные концовки" дублируется здесь же
     (не только в UI кнопки), чтобы покупка была невозможна в обход
     магазина, например из консоли. */
  function storyDone() {
    return !!(global.Progress && Progress.isCompleteSync('part1') && Progress.isCompleteSync('part1_secret') &&
      Progress.isCompleteSync('part2') && Progress.isCompleteSync('part2_secret'));
  }
  A.buy = function () {
    if (A.isUnlocked()) return true;
    if (!storyDone()) return false;
    if (!global.Coins || !Coins.spend(PRICE, 'Админ-панель')) return false;
    if (global.Progress) Progress.markComplete(FLAG);
    return true;
  };

  Object.defineProperty(A, 'god', { get: function () { return st.god; } });
  Object.defineProperty(A, 'noclip', { get: function () { return st.noclip; } });

  A.speedMul = function () { return st.speed; };
  A.jumpMul = function () { return st.jump; };
  A.mobScale = function () { return st.mob; };

  A.setGod = function (v) { st.god = !!v; save(); renderIfOpen(); };
  A.setNoclip = function (v) { st.noclip = !!v; save(); renderIfOpen(); };
  A.setSpeed = function (v) { st.speed = clampNum(v, 1, 5, 1); save(); renderIfOpen(); };
  A.setJump = function (v) { st.jump = clampNum(v, 1, 5, 1); save(); renderIfOpen(); };
  A.setMob = function (v) { st.mob = clampNum(v, 0.5, 4, 1); save(); renderIfOpen(); };

  /* ---------- панель ---------- */
  var panel = null;

  var CSS =
    '#adm-panel{position:fixed;inset:0;z-index:99998;background:rgba(4,4,6,.94);' +
    "font-family:'Courier New',monospace;color:#ded7c8;overflow-y:auto;display:none;}" +
    '#adm-panel.on{display:block;}' +
    '#adm-panel .in{max-width:520px;margin:0 auto;padding:26px 18px 60px;}' +
    '#adm-panel h2{font-size:15px;letter-spacing:6px;margin-bottom:6px;color:#ff5a5a;text-align:center;}' +
    '#adm-panel .warn{font-size:10px;color:#8a8578;text-align:center;margin-bottom:18px;}' +
    '#adm-panel .row{display:flex;align-items:center;gap:10px;padding:10px 0;font-size:12px;' +
    'border-bottom:1px solid rgba(255,255,255,.08);}' +
    '#adm-panel .row .n{flex:1;}' +
    '#adm-panel .hint{font-size:10px;color:#5a5560;margin-top:-4px;padding-bottom:8px;}' +
    '#adm-panel .k{background:#14141c;border:1px solid rgba(255,255,255,.22);color:#ded7c8;' +
    'padding:6px 12px;font-family:inherit;font-size:11px;letter-spacing:1px;cursor:pointer;min-width:90px;text-align:center;}' +
    '#adm-panel .k:hover{border-color:#ff5a5a;}' +
    '#adm-panel .k.on{background:#7a1f1f;border-color:#ff5a5a;color:#ffd6d6;}' +
    '#adm-panel input[type=range]{flex:1;}' +
    '#adm-panel .val{width:44px;text-align:right;color:#f0d060;}' +
    '#adm-panel .btn{width:100%;margin-top:16px;background:#14141c;color:#ded7c8;' +
    'border:2px solid rgba(255,255,255,.22);padding:11px;font-family:inherit;font-size:12px;' +
    'letter-spacing:3px;cursor:pointer;}' +
    '#adm-panel .btn:hover{background:#ff5a5a;color:#101014;border-color:#ff5a5a;}';

  function build() {
    if (panel) return;
    var s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s);
    panel = document.createElement('div');
    panel.id = 'adm-panel';
    panel.innerHTML = '<div class="in"><h2>АДМИН-ПАНЕЛЬ</h2>' +
      '<div class="warn">Может сломать прохождение — это твой выбор.</div>' +
      '<div id="adm-body"></div>' +
      '<button class="btn" id="adm-close">ЗАКРЫТЬ</button></div>';
    document.body.appendChild(panel);
    panel.querySelector('#adm-close').onclick = A.close;
    panel.addEventListener('click', function (e) { if (e.target === panel) A.close(); });
  }

  function toggleRow(label, hint, get, set) {
    var row = document.createElement('div'); row.className = 'row';
    var n = document.createElement('div'); n.className = 'n'; n.textContent = label;
    var b = document.createElement('button'); b.className = 'k' + (get() ? ' on' : '');
    b.textContent = get() ? 'ВКЛ' : 'ВЫКЛ';
    b.onclick = function () { set(!get()); renderBody(); };
    row.appendChild(n); row.appendChild(b);
    var wrap = document.createElement('div');
    wrap.appendChild(row);
    if (hint) { var h = document.createElement('div'); h.className = 'hint'; h.textContent = hint; wrap.appendChild(h); }
    return wrap;
  }

  function sliderRow(label, get, set, lo, hi, step) {
    var row = document.createElement('div'); row.className = 'row';
    var n = document.createElement('div'); n.className = 'n'; n.textContent = label;
    var inp = document.createElement('input'); inp.type = 'range';
    inp.min = lo; inp.max = hi; inp.step = step; inp.value = get();
    var val = document.createElement('div'); val.className = 'val'; val.textContent = 'x' + get();
    inp.oninput = function () { val.textContent = 'x' + inp.value; };
    inp.onchange = function () { set(parseFloat(inp.value)); };
    row.appendChild(n); row.appendChild(inp); row.appendChild(val);
    return row;
  }

  function renderBody() {
    var body = panel.querySelector('#adm-body');
    body.innerHTML = '';
    body.appendChild(toggleRow('Режим бессмертия', null, function () { return A.god; }, A.setGod));
    body.appendChild(toggleRow('Ноклип / полёт', 'Space — вверх, Ctrl — вниз, сквозь стены', function () { return A.noclip; }, A.setNoclip));
    body.appendChild(sliderRow('Скорость', A.speedMul, A.setSpeed, 1, 5, 0.5));
    body.appendChild(sliderRow('Высота прыжка', A.jumpMul, A.setJump, 1, 5, 0.5));
    body.appendChild(sliderRow('Размер врагов', A.mobScale, A.setMob, 0.5, 4, 0.25));
  }

  function renderIfOpen() { if (A.isOpen()) renderBody(); }

  A.open = function () { if (!A.isUnlocked()) return; build(); renderBody(); panel.classList.add('on'); };
  A.close = function () { if (panel) panel.classList.remove('on'); };
  A.isOpen = function () { return !!(panel && panel.classList.contains('on')); };

  global.ADMIN = A;
})(window);
