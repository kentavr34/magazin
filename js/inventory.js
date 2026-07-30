/* ============================================================
   INVENTORY — рюкзак и магазин
   ------------------------------------------------------------
   Одна панель на двоих, потому что это один и тот же экран для
   игрока: посмотреть, что есть, и куда это потратить.

   Рюкзак — витрина уже существующих данных (монеты, ключи),
   не новая механика. Магазин — ТОЛЬКО косметика фонарика за монеты,
   без влияния на баланс (см. VISUALSTYLE.md, правило 5, и решение
   по Этапу 7, пункт 5): никакого оружия, брони или ускорения.

   Владение купленным — через Progress (булев флаг, который только
   растёт: купил — значит владеешь навсегда, это ровно тот случай,
   для которого Progress и сделан). Выбранный сейчас скин — просто
   в localStorage этого устройства: это предпочтение экрана,
   а не прогресс, синхронизировать между устройствами незачем.
   ============================================================ */
(function (global) {
  'use strict';

  var LS_SKIN = 'magazin_flashlight_skin';

  var SKINS = [
    { id: 'amber', name: 'Тёплый (обычный)', price: 0, color: 0xfff5e0, lens: 0xffeec0, beam: 0xffe9bc },
    { id: 'blue', name: 'Холодный синий', price: 40, color: 0xbfe0ff, lens: 0xcfe8ff, beam: 0xcfe8ff },
    { id: 'green', name: 'Аварийный зелёный', price: 40, color: 0xcfffcf, lens: 0xd8ffd8, beam: 0xd8ffd8 },
    { id: 'red', name: 'Тревожный красный', price: 60, color: 0xffc0c0, lens: 0xffd0d0, beam: 0xffcccc }
  ];
  var byId = {}; SKINS.forEach(function (s) { byId[s.id] = s; });

  var Inv = {};

  function owned(id) {
    if (id === 'amber') return true;                 /* базовый — всегда есть */
    return !!(global.Progress && Progress.isCompleteSync('shop_fl_' + id));
  }
  function currentSkinId() {
    try { return localStorage.getItem(LS_SKIN) || 'amber'; } catch (e) { return 'amber'; }
  }
  function setCurrentSkin(id) {
    try { localStorage.setItem(LS_SKIN, id); } catch (e) { }
  }

  /* Перекрашивает и сам источник света, и видимую часть фонаря —
     иначе луч на экране один цвет, а освещение сцены другого. */
  Inv.applySkin = function () {
    var s = byId[currentSkinId()] || byId.amber;
    try {
      if (global.flashlight) global.flashlight.color.setHex(s.color);
      if (global.FLV) {
        if (FLV.lens) { FLV.lens.material.color.setHex(s.lens); FLV.lens.material.emissive.setHex(s.lens); }
        if (FLV.beam) FLV.beam.material.color.setHex(s.beam);
        if (FLV.glow) FLV.glow.material.color.setHex(s.beam);
      }
    } catch (e) { }
  };

  /* ---------- панель ---------- */
  var panel = null, btn = null;

  var CSS =
    '#inv-btn{position:fixed;top:10px;left:96px;z-index:96;width:34px;height:34px;' +
    'background:rgba(12,12,18,.6);border:1px solid rgba(240,208,96,.35);color:#e4e0d6;' +
    'font-size:16px;line-height:32px;text-align:center;cursor:pointer;user-select:none;}' +
    '#inv-btn:hover{border-color:#c9a227;}' +
    '#inv-panel{position:fixed;inset:0;z-index:99997;background:rgba(4,4,6,.92);' +
    "font-family:'Courier New',monospace;color:#ded7c8;overflow-y:auto;display:none;}" +
    '#inv-panel.on{display:block;}' +
    '#inv-panel .in{max-width:520px;margin:0 auto;padding:26px 18px 60px;}' +
    '#inv-panel h2{font-size:15px;letter-spacing:6px;margin-bottom:18px;color:#c9a227;text-align:center;}' +
    '#inv-panel h3{font-size:11px;letter-spacing:4px;color:#8a8578;margin:22px 0 10px;' +
    'border-bottom:1px solid rgba(255,255,255,.12);padding-bottom:6px;}' +
    '#inv-panel .row{display:flex;align-items:center;gap:10px;padding:6px 0;font-size:12px;}' +
    '#inv-panel .row .n{flex:1;}' +
    '#inv-panel .keydot{width:13px;height:13px;border-radius:50%;border:2px solid;opacity:.3;}' +
    '#inv-panel .keydot.have{opacity:1;box-shadow:0 0 8px currentColor;}' +
    '#inv-panel .shopitem{display:flex;align-items:center;gap:10px;padding:8px 0;' +
    'border-bottom:1px solid rgba(255,255,255,.08);}' +
    '#inv-panel .swatch{width:20px;height:20px;border-radius:50%;border:1px solid rgba(255,255,255,.3);flex:0 0 auto;}' +
    '#inv-panel .shopitem .n{flex:1;font-size:12px;}' +
    '#inv-panel .k{background:#14141c;border:1px solid rgba(255,255,255,.22);color:#ded7c8;' +
    'padding:6px 12px;font-family:inherit;font-size:11px;letter-spacing:1px;cursor:pointer;min-width:96px;text-align:center;}' +
    '#inv-panel .k:hover{border-color:#c9a227;}' +
    '#inv-panel .k.owned{background:#2a3a2c;border-color:#3fa85f;color:#a8d8b4;cursor:default;}' +
    '#inv-panel .k.active{background:#c9a227;color:#101014;border-color:#c9a227;cursor:default;}' +
    '#inv-panel .k[disabled]{opacity:.4;cursor:default;}' +
    '#inv-panel .btn{width:100%;margin-top:16px;background:#14141c;color:#ded7c8;' +
    'border:2px solid rgba(255,255,255,.22);padding:11px;font-family:inherit;font-size:12px;' +
    'letter-spacing:3px;cursor:pointer;}' +
    '#inv-panel .btn:hover{background:#c9a227;color:#101014;border-color:#c9a227;}';

  function build() {
    if (panel) return;
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

    btn = document.createElement('div');
    btn.id = 'inv-btn'; btn.textContent = '🎒'; btn.title = 'Рюкзак и магазин';
    btn.onclick = function (e) { e.stopPropagation(); Inv.open(); };
    document.body.appendChild(btn);

    panel = document.createElement('div');
    panel.id = 'inv-panel';
    panel.innerHTML = '<div class="in"><h2>Р Ю К З А К</h2>' +
      '<h3>МОНЕТЫ</h3><div class="row"><div class="n">Баланс</div><div id="inv-coins" style="color:#f0d060;">🪙 0</div></div>' +
      '<h3>КЛЮЧИ</h3><div id="inv-keys"></div>' +
      '<h3>МАГАЗИН — ЦВЕТ ЛУЧА ФОНАРИКА</h3><div id="inv-shop"></div>' +
      '<div class="row" style="font-size:10px;color:#5a5560;margin-top:10px;">' +
      'Только внешний вид — на игру и сложность не влияет.</div>' +
      '<button class="btn" id="inv-close">ЗАКРЫТЬ</button></div>';
    document.body.appendChild(panel);
    panel.querySelector('#inv-close').onclick = Inv.close;
    panel.addEventListener('click', function (e) { if (e.target === panel) Inv.close(); });
  }

  function renderKeys() {
    var el = panel.querySelector('#inv-keys');
    el.innerHTML = '';
    var KEYS_OBJ = global.KEYS || {};
    [['red', '#ff2a2a', 'Красный'], ['green', '#2ad84a', 'Зелёный'], ['blue', '#3a7cff', 'Синий']].forEach(function (k) {
      var row = document.createElement('div'); row.className = 'row';
      var dot = document.createElement('div');
      dot.className = 'keydot' + (KEYS_OBJ[k[0]] ? ' have' : '');
      dot.style.borderColor = k[1]; dot.style.color = k[1];
      var n = document.createElement('div'); n.className = 'n';
      n.textContent = k[2] + ' генератор (чердак)';
      row.appendChild(dot); row.appendChild(n);
      el.appendChild(row);
    });
  }

  function renderShop() {
    var el = panel.querySelector('#inv-shop');
    el.innerHTML = '';
    var cur = currentSkinId();
    SKINS.forEach(function (s) {
      var row = document.createElement('div'); row.className = 'shopitem';
      var sw = document.createElement('div'); sw.className = 'swatch';
      sw.style.background = '#' + s.lens.toString(16).padStart(6, '0');
      var n = document.createElement('div'); n.className = 'n';
      n.textContent = s.name + (s.price ? ' — 🪙 ' + s.price : ' — бесплатно');
      var b = document.createElement('button'); b.className = 'k';
      var isOwned = owned(s.id), isActive = cur === s.id;
      if (isActive) { b.textContent = 'НАДЕТО'; b.className += ' active'; }
      else if (isOwned) { b.textContent = 'НАДЕТЬ'; b.className += ' owned'; b.onclick = function () { wear(s.id); }; }
      else {
        b.textContent = 'КУПИТЬ';
        if (!global.Coins || Coins.get() < s.price) b.setAttribute('disabled', 'true');
        b.onclick = function () { buy(s); };
      }
      row.appendChild(sw); row.appendChild(n); row.appendChild(b);
      el.appendChild(row);
    });
  }

  function wear(id) {
    setCurrentSkin(id);
    Inv.applySkin();
    renderShop();
  }
  function buy(s) {
    if (!global.Coins || !Coins.spend(s.price, s.name)) return;
    if (global.Progress) Progress.markComplete('shop_fl_' + s.id);
    wear(s.id);
  }

  function renderAll() {
    build();
    panel.querySelector('#inv-coins').textContent = '🪙 ' + (global.Coins ? Coins.get() : 0);
    renderKeys();
    renderShop();
  }

  Inv.open = function () { build(); renderAll(); panel.classList.add('on'); };
  Inv.close = function () { if (panel) panel.classList.remove('on'); };
  Inv.isOpen = function () { return !!(panel && panel.classList.contains('on')); };

  document.addEventListener('keydown', function (e) {
    if (e.code === 'KeyI' && global.MAGAZIN_IN_GAME) {
      if (Inv.isOpen()) Inv.close(); else Inv.open();
    }
  });

  build();
  if (global.Coins) Coins.onChange(function () { if (Inv.isOpen()) renderAll(); });
  Inv.applySkin();

  global.Inventory = Inv;
})(window);
