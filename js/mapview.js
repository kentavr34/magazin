/* ============================================================
   MAPVIEW — карта этажа
   ------------------------------------------------------------
   Почти бесплатно: уровень уже хранится сеткой (currentMap),
   позиция и поворот игрока уже известны (P.x, P.z, P.yaw) —
   остаётся только нарисовать это сверху вниз на canvas.

   Открывается по кнопке или клавише M, не висит поверх экрана
   постоянно: карта — это пауза подумать, а не подсказка в бою,
   иначе she снимает всё напряжение, ради которого игра существует.
   ============================================================ */
(function (global) {
  'use strict';

  var COLORS = {
    0: '#3a3630',   // пол
    1: '#0c0b09',   // стена
    2: '#5a1414',   // ловушка
    3: '#6a5020',   // дверь
    4: '#204a20',   // лестница
    5: '#4a3018',   // диван (укрытие)
    6: '#282640',   // кровать
    9: '#1a4a1a',   // фальшивый выход
    14: '#1a3a6a'   // настоящий выход
  };

  var Map = {};
  var panel = null, btn = null, canvas = null, ctx = null, raf = null;

  var CSS =
    '#map-btn{position:fixed;top:10px;left:136px;z-index:96;width:34px;height:34px;' +
    'background:rgba(12,12,18,.6);border:1px solid rgba(240,208,96,.35);color:#e4e0d6;' +
    'font-size:16px;line-height:32px;text-align:center;cursor:pointer;user-select:none;}' +
    '#map-btn:hover{border-color:#c9a227;}' +
    '#map-panel{position:fixed;inset:0;z-index:99996;background:rgba(4,4,6,.92);' +
    "font-family:'Courier New',monospace;color:#ded7c8;display:none;" +
    'flex-direction:column;align-items:center;justify-content:center;}' +
    '#map-panel.on{display:flex;}' +
    '#map-panel h2{font-size:14px;letter-spacing:5px;color:#c9a227;margin-bottom:14px;}' +
    '#map-panel canvas{border:1px solid rgba(255,255,255,.15);background:#050505;}' +
    '#map-panel .legend{display:flex;flex-wrap:wrap;gap:10px 16px;max-width:420px;' +
    'justify-content:center;margin-top:14px;font-size:10px;color:#8a8578;}' +
    '#map-panel .legend span{display:inline-flex;align-items:center;gap:5px;}' +
    '#map-panel .legend i{width:10px;height:10px;display:inline-block;border-radius:2px;}' +
    '#map-panel .btn{margin-top:18px;background:#14141c;color:#ded7c8;' +
    'border:2px solid rgba(255,255,255,.22);padding:10px 30px;font-family:inherit;' +
    'font-size:12px;letter-spacing:3px;cursor:pointer;}' +
    '#map-panel .btn:hover{background:#c9a227;color:#101014;border-color:#c9a227;}';

  function build() {
    if (panel) return;
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

    btn = document.createElement('div');
    btn.id = 'map-btn'; btn.textContent = '🗺️'; btn.title = 'Карта этажа (M)';
    btn.onclick = function (e) { e.stopPropagation(); Map.open(); };
    document.body.appendChild(btn);

    panel = document.createElement('div');
    panel.id = 'map-panel';
    canvas = document.createElement('canvas');
    canvas.width = 400; canvas.height = 400;
    ctx = canvas.getContext('2d');
    panel.innerHTML = '<h2>КАРТА ЭТАЖА</h2>';
    panel.appendChild(canvas);
    var legend = document.createElement('div'); legend.className = 'legend';
    [['пол', COLORS[0]], ['стена', COLORS[1]], ['ловушка', COLORS[2]],
     ['укрытие', COLORS[5]], ['выход', COLORS[14]]].forEach(function (l) {
      var s = document.createElement('span');
      s.innerHTML = '<i style="background:' + l[1] + '"></i>' + l[0];
      legend.appendChild(s);
    });
    panel.appendChild(legend);
    var b = document.createElement('button'); b.className = 'btn'; b.textContent = 'ЗАКРЫТЬ';
    b.onclick = Map.close;
    panel.appendChild(b);
    panel.addEventListener('click', function (e) { if (e.target === panel) Map.close(); });
    document.body.appendChild(panel);
  }

  function draw() {
    if (!ctx || !global.currentMap) return;
    var grid = global.currentMap;
    var n = grid.length;
    var cell = canvas.width / n;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (var z = 0; z < n; z++) {
      for (var x = 0; x < grid[z].length; x++) {
        var v = grid[z][x];
        ctx.fillStyle = COLORS[v] || COLORS[0];
        ctx.fillRect(x * cell, z * cell, cell + 0.5, cell + 0.5);
      }
    }
    /* игрок — золотой треугольник, повёрнутый по P.yaw */
    var P = global.P;
    if (P) {
      var px = P.x * cell, pz = P.z * cell;
      ctx.save();
      ctx.translate(px, pz);
      ctx.rotate(P.yaw || 0);
      ctx.fillStyle = '#c9a227';
      ctx.beginPath();
      ctx.moveTo(0, -cell * 0.9);
      ctx.lineTo(cell * 0.6, cell * 0.6);
      ctx.lineTo(-cell * 0.6, cell * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function loop() {
    if (!Map.isOpen()) return;
    draw();
    raf = requestAnimationFrame(loop);
  }

  Map.open = function () {
    build();
    panel.classList.add('on');
    if (raf) cancelAnimationFrame(raf);
    loop();
  };
  Map.close = function () {
    if (panel) panel.classList.remove('on');
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  };
  Map.isOpen = function () { return !!(panel && panel.classList.contains('on')); };

  document.addEventListener('keydown', function (e) {
    if (e.code === 'KeyM' && global.MAGAZIN_IN_GAME) {
      if (Map.isOpen()) Map.close(); else Map.open();
    }
  });

  build();
  global.MapView = Map;
})(window);
