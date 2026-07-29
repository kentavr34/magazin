/* ============================================================
   CONTROLS — управление и настройки
   ------------------------------------------------------------
   Подключается ПЕРЕД скриптом игры.

   Главная мысль: игра внутри по-прежнему думает, что вперёд —
   это «KeyW». Мы не переписываем сотню мест, где это проверяется,
   а подменяем ввод на входе: игрок нажал стрелку вверх — мы
   говорим игре «нажат KeyW». Поэтому переназначить можно любую
   клавишу, и ни одна строка игровой логики не меняется.

   Что даёт:
     · мышь для обзора с захватом указателя, чувствительность
       и инверсия оси Y настраиваются;
     · любая клавиша переназначается, раскладка запоминается;
     · геймпад: левый стик — ходьба, правый — обзор, кнопки;
     · экран настроек по Escape или по шестерёнке в углу;
     · управление с телефона не тронуто вообще.
   ============================================================ */
(function (global) {
  'use strict';

  var C = {};
  global.CONTROLS = C;

  var LS = 'magazin_controls';

  /* ---------- действия ----------
     canon — тот код клавиши, который игра ждёт внутри себя.
     Менять его нельзя: на него завязана игровая логика. */
  var ACTIONS = [
    { id: 'forward', name: 'Вперёд', canon: 'KeyW', def: ['KeyW', 'ArrowUp'] },
    { id: 'back', name: 'Назад', canon: 'KeyS', def: ['KeyS', 'ArrowDown'] },
    { id: 'left', name: 'Влево', canon: 'KeyA', def: ['KeyA', 'ArrowLeft'] },
    { id: 'right', name: 'Вправо', canon: 'KeyD', def: ['KeyD', 'ArrowRight'] },
    { id: 'run', name: 'Бег', canon: 'ShiftLeft', def: ['ShiftLeft', 'ShiftRight'] },
    { id: 'crouch', name: 'Присесть', canon: 'ControlLeft', def: ['ControlLeft', 'ControlRight', 'KeyC'] },
    { id: 'jump', name: 'Прыжок', canon: 'Space', def: ['Space'] },
    { id: 'action', name: 'Действие', canon: 'KeyE', def: ['KeyE'] },
    { id: 'torch', name: 'Фонарь', canon: 'KeyF', def: ['KeyF'] },
    { id: 'uv', name: 'УФ-излучатель', canon: 'KeyQ', def: ['KeyQ'] },
    { id: 'reload', name: 'Перезарядка', canon: 'KeyR', def: ['KeyR'] }
  ];

  var byId = {};
  ACTIONS.forEach(function (a) { byId[a.id] = a; });

  /* ---------- настройки ---------- */
  var S = {
    binds: {},            /* id действия → список кодов клавиш */
    mouse: 1.0,           /* множитель чувствительности */
    invertY: false,
    padLook: 1.0,
    padDead: 0.18,        /* мёртвая зона стика: изношенный геймпад «плывёт» */
    difficulty: 1         /* 0 легче, 1 обычно (заводское поведение игры), 2 сложнее */
  };
  /* Один множитель на скорость и слух противников. По умолчанию (1)
     ровно то же поведение, что было в игре всегда — этот множитель
     нигде не меняет сюжет и уровни, только то, насколько быстро
     и издалека противник замечает игрока. */
  var DIFF_MUL = [0.8, 1.0, 1.25];
  C.diffMul = function () { return DIFF_MUL[S.difficulty]; };

  function defaults() {
    var b = {};
    ACTIONS.forEach(function (a) { b[a.id] = a.def.slice(); });
    return b;
  }

  function load() {
    S.binds = defaults();
    try {
      var raw = localStorage.getItem(LS);
      if (!raw) return;
      var j = JSON.parse(raw);
      if (j.binds) {
        ACTIONS.forEach(function (a) {
          if (Array.isArray(j.binds[a.id]) && j.binds[a.id].length) {
            S.binds[a.id] = j.binds[a.id].slice(0, 3);
          }
        });
      }
      if (typeof j.mouse === 'number') S.mouse = clamp(j.mouse, 0.2, 4);
      if (typeof j.invertY === 'boolean') S.invertY = j.invertY;
      if (typeof j.padLook === 'number') S.padLook = clamp(j.padLook, 0.2, 4);
      if (j.difficulty === 0 || j.difficulty === 1 || j.difficulty === 2) S.difficulty = j.difficulty;
    } catch (e) { }
  }
  function save() {
    try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) { }
    rebuildIndex();
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* ---------- быстрый поиск: код клавиши → канонический код ---------- */
  var index = {};
  function rebuildIndex() {
    index = {};
    ACTIONS.forEach(function (a) {
      (S.binds[a.id] || []).forEach(function (code) { index[code] = a.canon; });
    });
  }

  load();
  rebuildIndex();

  /* ============================================================
     То, что вызывает игра
     ============================================================ */

  /* Физическая клавиша → код, который понимает игра.
     Незнакомая клавиша возвращается как есть: так продолжают
     работать места, куда мы не заглядывали. */
  C.canon = function (code) { return index[code] || code; };

  /* Занята ли клавиша игрой. Нужно, чтобы не гасить браузерные
     сочетания вроде F5 и Ctrl+C. */
  C.isBound = function (code) { return !!index[code]; };

  C.mouseX = function () { return 0.002 * S.mouse; };
  C.mouseY = function () { return 0.002 * S.mouse * (S.invertY ? -1 : 1); };

  C.isTouch = function () {
    return ('ontouchstart' in global) || (navigator.maxTouchPoints > 0);
  };

  /* Захват указателя: без него мышь упирается в край экрана.
     Вешается на элемент с картинкой; на телефоне не нужен. */
  C.enablePointerLock = function (el) {
    if (!el || C.isTouch()) return;
    el.addEventListener('click', function () {
      if (uiOpen) return;                       /* в настройках мышь нужна обычная */
      if (document.pointerLockElement === el) return;
      if (el.requestPointerLock) el.requestPointerLock();
    });
  };

  /* ============================================================
     Геймпад
     ------------------------------------------------------------
     Пишем в те же переменные, что и экранный джойстик: игра
     не различает, откуда пришло движение.
     ============================================================ */
  var padPrev = {};
  C.tickPad = function (P, K, dt) {
    var pads;
    try { pads = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { return; }
    var g = null;
    for (var i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { g = pads[i]; break; }
    if (!g) return;

    function ax(n) {
      var v = g.axes[n] || 0;
      return Math.abs(v) < S.padDead ? 0 : v;
    }
    /* левый стик — ходьба, в те же jmx/jmy, что и экранный джойстик */
    var lx = ax(0), ly = ax(1);
    if (lx || ly) { global.jmx = lx; global.jmy = ly; }
    else if (Math.abs(global.jmx || 0) < 0.001 || padUsed) { global.jmx = 0; global.jmy = 0; }
    if (lx || ly) padUsed = true;

    /* правый стик — обзор */
    var rx = ax(2), ry = ax(3);
    if (P && (rx || ry)) {
      var k = 0.045 * S.padLook * (dt ? Math.min(dt, 0.05) / 0.016 : 1);
      P.yaw -= rx * k;
      P.pitch = clamp(P.pitch - ry * k * (S.invertY ? -1 : 1), -0.6, 0.6);
    }

    /* кнопки: A — прыжок, X — действие, LB — присед, RB — бег */
    function btn(n) { return !!(g.buttons[n] && g.buttons[n].pressed); }
    global.mJump = btn(0);
    global.mRun = btn(5) || btn(7);
    global.mCrouch = btn(4) || btn(6);
    if (btn(2) && !padPrev.act && typeof global.actPress === 'function') global.actPress();
    if (btn(2) && !padPrev.act && typeof global.doAct === 'function') global.doAct();
    if (btn(3) && !padPrev.torch) {
      if (typeof global.toggleTorch === 'function') global.toggleTorch();
      else if (typeof global.toggleFL === 'function') global.toggleFL();
    }
    padPrev.act = btn(2);
    padPrev.torch = btn(3);
  };
  var padUsed = false;

  /* ============================================================
     Экран настроек
     ============================================================ */
  var uiOpen = false, ui = null, waitingFor = null;

  var CSS =
    '#mg-set{position:fixed;inset:0;z-index:99998;background:rgba(4,4,6,.94);' +
    "font-family:'Courier New',monospace;color:#ded7c8;overflow-y:auto;display:none;}" +
    '#mg-set.on{display:block;}' +
    '#mg-set .in{max-width:620px;margin:0 auto;padding:26px 18px 60px;}' +
    '#mg-set h2{font-size:15px;letter-spacing:6px;margin-bottom:20px;color:#c9a227;text-align:center;}' +
    '#mg-set h3{font-size:11px;letter-spacing:4px;color:#8a8578;margin:24px 0 10px;' +
    'border-bottom:1px solid rgba(255,255,255,.12);padding-bottom:6px;}' +
    '#mg-set .row{display:flex;align-items:center;gap:10px;padding:7px 0;}' +
    '#mg-set .row .n{flex:1;font-size:12px;}' +
    '#mg-set .k{background:#14141c;border:1px solid rgba(255,255,255,.22);color:#ded7c8;' +
    'padding:6px 10px;font-family:inherit;font-size:11px;letter-spacing:1px;cursor:pointer;' +
    'min-width:96px;text-align:center;}' +
    '#mg-set .k:hover{border-color:#c9a227;}' +
    '#mg-set .k.wait{background:#c9a227;color:#101014;border-color:#c9a227;}' +
    '#mg-set input[type=range]{flex:1;accent-color:#c9a227;}' +
    '#mg-set .val{width:44px;text-align:right;font-size:11px;color:#8a8578;}' +
    '#mg-set .btn{width:100%;margin-top:9px;background:#14141c;color:#ded7c8;' +
    'border:2px solid rgba(255,255,255,.22);padding:11px;font-family:inherit;' +
    'font-size:12px;letter-spacing:3px;cursor:pointer;}' +
    '#mg-set .btn:hover{background:#c9a227;color:#101014;border-color:#c9a227;}' +
    '#mg-set .hint{font-size:10px;color:#5a5560;line-height:1.7;margin-top:8px;}' +
    '#mg-gear{position:fixed;top:10px;right:10px;z-index:97;width:34px;height:34px;' +
    'background:rgba(12,12,18,.75);border:1px solid rgba(255,255,255,.2);color:#ded7c8;' +
    'font-size:16px;line-height:32px;text-align:center;cursor:pointer;user-select:none;}' +
    '#mg-gear:hover{border-color:#c9a227;color:#c9a227;}';

  function keyLabel(code) {
    if (!code) return '—';
    var m = {
      Space: 'ПРОБЕЛ', ShiftLeft: 'SHIFT слева', ShiftRight: 'SHIFT справа',
      ControlLeft: 'CTRL слева', ControlRight: 'CTRL справа',
      ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
      AltLeft: 'ALT слева', AltRight: 'ALT справа', Tab: 'TAB', Enter: 'ВВОД',
      Backquote: '~', Minus: '-', Equal: '='
    };
    if (m[code]) return m[code];
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);
    if (/^Numpad/.test(code)) return 'NUM ' + code.slice(6);
    return code;
  }

  function build() {
    if (ui) return ui;
    var st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);

    ui = document.createElement('div');
    ui.id = 'mg-set';
    ui.innerHTML = '<div class="in"><h2>Н А С Т Р О Й К И</h2>' +
      '<h3>УПРАВЛЕНИЕ</h3><div id="mg-keys"></div>' +
      '<h3>МЫШЬ И ГЕЙМПАД</h3><div id="mg-mouse"></div>' +
      '<h3>СЛОЖНОСТЬ</h3><div id="mg-diff"></div>' +
      '<h3>КАЧЕСТВО КАРТИНКИ</h3><div id="mg-q"></div>' +
      '<button class="btn" id="mg-reset">СБРОСИТЬ К ЗАВОДСКИМ</button>' +
      '<button class="btn" id="mg-close">ЗАКРЫТЬ</button>' +
      '<div class="hint">Нажмите на клавишу справа от действия и затем ту кнопку, ' +
      'которую хотите назначить. Escape — отмена и закрытие настроек.</div></div>';
    document.body.appendChild(ui);

    ui.querySelector('#mg-close').onclick = C.closeSettings;
    ui.querySelector('#mg-reset').onclick = function () {
      S.binds = defaults(); S.mouse = 1; S.invertY = false; S.padLook = 1; S.difficulty = 1;
      save(); render();
    };
    return ui;
  }

  function render() {
    var keys = ui.querySelector('#mg-keys');
    keys.innerHTML = '';
    ACTIONS.forEach(function (a) {
      var row = document.createElement('div');
      row.className = 'row';
      var n = document.createElement('div');
      n.className = 'n'; n.textContent = a.name;
      var b = document.createElement('button');
      b.className = 'k';
      b.textContent = (S.binds[a.id] || []).map(keyLabel).join(' · ') || '—';
      b.onclick = function () {
        if (waitingFor) waitingFor.el.classList.remove('wait');
        waitingFor = { id: a.id, el: b };
        b.classList.add('wait');
        b.textContent = 'ЖДУ КЛАВИШУ…';
      };
      row.appendChild(n); row.appendChild(b);
      keys.appendChild(row);
    });

    var mouse = ui.querySelector('#mg-mouse');
    mouse.innerHTML = '';
    mouse.appendChild(slider('Чувствительность мыши', S.mouse, 0.2, 4, 0.1, function (v) {
      S.mouse = v; save();
    }));
    mouse.appendChild(slider('Чувствительность стика', S.padLook, 0.2, 4, 0.1, function (v) {
      S.padLook = v; save();
    }));
    mouse.appendChild(toggle('Инверсия оси Y', S.invertY, function (v) {
      S.invertY = v; save();
    }));

    var diff = ui.querySelector('#mg-diff');
    diff.innerHTML = '';
    (function () {
      var names = ['МНЕ ЛЕГЧЕ', 'ОБЫЧНО', 'МНЕ СЛОЖНЕЕ'];
      var row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = '<div class="n">Реакция и слух противников</div>';
      var b = document.createElement('button');
      b.className = 'k'; b.style.minWidth = '140px';
      b.textContent = names[S.difficulty];
      b.onclick = function () {
        S.difficulty = (S.difficulty + 1) % 3;
        b.textContent = names[S.difficulty];
        save();
      };
      row.appendChild(b);
      diff.appendChild(row);
      var h = document.createElement('div');
      h.className = 'hint';
      h.textContent = 'Не меняет уровни и сюжет — только то, насколько быстро ' +
        'и издалека противник замечает игрока. «Обычно» — как было всегда.';
      diff.appendChild(h);
    })();

    var q = ui.querySelector('#mg-q');
    q.innerHTML = '';
    if (global.DETAIL) {
      var names = ['Самое лёгкое', 'Лёгкое', 'Хорошее', 'Максимум'];
      var cur = DETAIL.level();
      var row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = '<div class="n">Уровень детализации</div>';
      var b = document.createElement('button');
      b.className = 'k';
      b.style.minWidth = '140px';
      b.textContent = names[cur];
      b.onclick = function () {
        cur = (cur + 1) % 4;
        DETAIL.setLevel(cur); DETAIL.lockQuality();
        b.textContent = names[cur];
      };
      row.appendChild(b);
      q.appendChild(row);
      var h = document.createElement('div');
      h.className = 'hint';
      h.textContent = 'Обычно игра подбирает уровень сама по частоте кадров. ' +
        'Выбрали руками — подбор выключается до следующего запуска.';
      q.appendChild(h);
    } else {
      q.innerHTML = '<div class="hint">Настройка недоступна на этом экране.</div>';
    }
  }

  function slider(name, val, min, max, step, cb) {
    var row = document.createElement('div');
    row.className = 'row';
    var n = document.createElement('div');
    n.className = 'n'; n.textContent = name;
    var r = document.createElement('input');
    r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = val;
    var v = document.createElement('div');
    v.className = 'val'; v.textContent = Number(val).toFixed(1);
    r.oninput = function () { v.textContent = Number(r.value).toFixed(1); cb(Number(r.value)); };
    row.appendChild(n); row.appendChild(r); row.appendChild(v);
    return row;
  }

  function toggle(name, val, cb) {
    var row = document.createElement('div');
    row.className = 'row';
    var n = document.createElement('div');
    n.className = 'n'; n.textContent = name;
    var b = document.createElement('button');
    b.className = 'k';
    b.textContent = val ? 'ВКЛ' : 'ВЫКЛ';
    b.onclick = function () { val = !val; b.textContent = val ? 'ВКЛ' : 'ВЫКЛ'; cb(val); };
    row.appendChild(n); row.appendChild(b);
    return row;
  }

  C.openSettings = function () {
    build(); render();
    ui.classList.add('on');
    uiOpen = true;
    if (document.exitPointerLock) document.exitPointerLock();
  };
  C.closeSettings = function () {
    if (!ui) return;
    ui.classList.remove('on');
    uiOpen = false;
    if (waitingFor) { waitingFor.el.classList.remove('wait'); waitingFor = null; render(); }
  };
  C.settingsOpen = function () { return uiOpen; };

  /* Перехват нажатия при переназначении — раньше всех остальных
     обработчиков, поэтому capture: true. */
  document.addEventListener('keydown', function (e) {
    if (waitingFor) {
      e.preventDefault(); e.stopPropagation();
      if (e.code === 'Escape') {
        waitingFor.el.classList.remove('wait'); waitingFor = null; render(); return;
      }
      /* Одна клавиша — одно действие: снимаем её с прежнего владельца,
         иначе бег и присед окажутся на одной кнопке. */
      ACTIONS.forEach(function (a) {
        S.binds[a.id] = (S.binds[a.id] || []).filter(function (c) { return c !== e.code; });
      });
      S.binds[waitingFor.id] = [e.code];
      waitingFor.el.classList.remove('wait');
      waitingFor = null;
      save(); render();
      return;
    }
    if (e.code === 'Escape') {
      if (uiOpen) { C.closeSettings(); e.preventDefault(); }
      else if (global.MAGAZIN_IN_GAME) { C.openSettings(); e.preventDefault(); }
    }
  }, true);

  /* Шестерёнка появляется только там, где есть мышь или клавиатура:
     на телефоне она перекрыла бы игровые кнопки. */
  C.addGear = function () {
    if (document.getElementById('mg-gear')) return;
    build();
    var g = document.createElement('div');
    g.id = 'mg-gear';
    g.textContent = '⚙';
    g.title = 'Настройки (Escape)';
    g.onclick = function (e) { e.stopPropagation(); C.openSettings(); };
    document.body.appendChild(g);
  };

  C.actions = ACTIONS;
  C.state = S;
})(window);
