/* ============================================================
   DETAIL — слой детализации поверх игры
   ------------------------------------------------------------
   Подключается ПЕРЕД основным скриптом игры и ничего не делает
   сам по себе: игра вызывает его в шести местах. Если файл не
   загрузился — игра работает как раньше, все вызовы через
   `window.DETAIL &&`.

   Что даёт:
     · текстуры 512 вместо 256 + анизотропия по возможностям видео;
     · нормал-карты, посчитанные из тех же процедурных текстур —
       кирпич, доска и ткань перестают быть плоской заливкой;
     · мягкие тени от солнца и от ближней лампы;
     · пыль в воздухе (Points, один draw call);
     · световые столбы от ламп;
     · виньетка и зерно плёнки поверх кадра — слой CSS, GPU не грузит;
     · АВТОКАЧЕСТВО: раз в секунду смотрит на FPS и сам снимает
       нагрузку, пока кадр не станет ровным. На телефоне игра сама
       опустится до уровня, который он тянет.
   ============================================================ */
(function () {
  'use strict';

  var D = {};
  window.DETAIL = D;

  /* ---------- уровни качества ----------
     0 — телефон послабее, 1 — обычный телефон, 2 — планшет/ПК, 3 — ПК с запасом */
  var LEVELS = [
    { tex: 256, aniso: 1, aa: false, pr: 1.00, shadow: 0, dust: 0, shafts: false, grain: false },
    { tex: 256, aniso: 4, aa: false, pr: 1.25, shadow: 0, dust: 260, shafts: true, grain: true },
    { tex: 512, aniso: 8, aa: true, pr: 1.50, shadow: 1024, dust: 550, shafts: true, grain: true },
    { tex: 512, aniso: 16, aa: true, pr: 2.00, shadow: 2048, dust: 900, shafts: true, grain: true }
  ];

  /* Номер правил подбора качества. Меняется, когда меняется сама логика
     замера, — тогда старое запомненное значение выбрасывается. Иначе
     телефон, которому когда-то ошибочно занизили качество, так и остался
     бы на нём навсегда. */
  var QRULES = '2';

  function guessLevel() {
    try {
      if (localStorage.getItem('magazin_q_rules') === QRULES) {
        var saved = localStorage.getItem('magazin_q');
        if (saved !== null) return Math.max(0, Math.min(3, parseInt(saved, 10) || 0));
      } else {
        localStorage.removeItem('magazin_q');
        localStorage.setItem('magazin_q_rules', QRULES);
      }
    } catch (e) { }
    var mob = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
    var cores = navigator.hardwareConcurrency || (mob ? 4 : 8);
    var mem = navigator.deviceMemory || (mob ? 3 : 8);
    if (mob) return (cores >= 8 && mem >= 6) ? 2 : 1;
    return (cores >= 8 && mem >= 8) ? 3 : 2;
  }

  var lvl = guessLevel();
  function Q() { return LEVELS[lvl]; }

  D.level = function () { return lvl; };
  D.texSize = function () { return Q().tex; };
  D.wantAA = function () { return Q().aa; };
  D.pixelRatio = function () { return Math.min(window.devicePixelRatio || 1, Q().pr); };

  /* максимальная анизотропия, которую реально держит видеокарта */
  var maxAniso = 0;
  D.aniso = function () {
    if (!maxAniso && window.RENDERER_REF && RENDERER_REF.capabilities) {
      try { maxAniso = RENDERER_REF.capabilities.getMaxAnisotropy(); } catch (e) { maxAniso = 4; }
    }
    return Math.min(Q().aniso, maxAniso || 4);
  };

  /* ============================================================
     1. НОРМАЛ-КАРТЫ ИЗ ПРОЦЕДУРНЫХ ТЕКСТУР
     Берём яркость пикселя как высоту и считаем наклон поверхности.
     Так плитка получает шов, доска — волокно, ткань — переплетение,
     и всё это ловит свет, а не просто раскрашено.
     ============================================================ */
  function normalFromCanvas(canvas, strength) {
    try {
      var w = canvas.width, h = canvas.height;
      var src = canvas.getContext('2d').getImageData(0, 0, w, h).data;
      var out = document.createElement('canvas');
      out.width = w; out.height = h;
      var oc = out.getContext('2d');
      var img = oc.createImageData(w, h);
      var o = img.data;
      var k = strength === undefined ? 2.0 : strength;

      function lum(x, y) {
        x = (x + w) % w; y = (y + h) % h;
        var i = (y * w + x) * 4;
        return (src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114) / 255;
      }
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          /* Собель по X и Y — наклон высоты в этой точке */
          var dx = (lum(x - 1, y - 1) + 2 * lum(x - 1, y) + lum(x - 1, y + 1)) -
            (lum(x + 1, y - 1) + 2 * lum(x + 1, y) + lum(x + 1, y + 1));
          var dy = (lum(x - 1, y - 1) + 2 * lum(x, y - 1) + lum(x + 1, y - 1)) -
            (lum(x - 1, y + 1) + 2 * lum(x, y + 1) + lum(x + 1, y + 1));
          var nx = -dx * k, ny = -dy * k, nz = 1.0;
          var len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
          var i2 = (y * w + x) * 4;
          o[i2] = ((nx / len) * 0.5 + 0.5) * 255;
          o[i2 + 1] = ((ny / len) * 0.5 + 0.5) * 255;
          o[i2 + 2] = ((nz / len) * 0.5 + 0.5) * 255;
          o[i2 + 3] = 255;
        }
      }
      oc.putImageData(img, 0, 0);
      return out;
    } catch (e) { return null; }
  }

  /* Все текстуры, которых мы касались. Нужны, потому что в первой части
     материалы собираются ДО создания рендерера — предел анизотропии тогда
     ещё неизвестен, и его приходится проставлять второй раз. */
  var touched = [];
  function remember(t) { if (t && touched.indexOf(t) === -1) touched.push(t); return t; }
  function refreshAniso() {
    var a = D.aniso();
    for (var i = 0; i < touched.length; i++) {
      if (touched[i].anisotropy !== a) { touched[i].anisotropy = a; touched[i].needsUpdate = true; }
    }
  }

  /* Карта шероховатости из той же процедурной текстуры: средняя яркость
     берётся за нейтральную точку, тёмные места (грязь/потёртости — уже
     рисуются провалами яркости, см. VISUALSTYLE.md) становятся более
     шероховатыми, светлые — чуть более гладкими. Та же идея, что и
     normalFromCanvas() выше, только через luminance, а не Sobel. */
  function roughnessFromCanvas(canvas, variance) {
    try {
      var w = canvas.width, h = canvas.height;
      var src = canvas.getContext('2d').getImageData(0, 0, w, h).data;
      var out = document.createElement('canvas');
      out.width = w; out.height = h;
      var oc = out.getContext('2d');
      var img = oc.createImageData(w, h);
      var o = img.data;
      var v = variance === undefined ? 0.35 : variance;
      var sum = 0, n = w * h;
      for (var i = 0; i < n; i++) {
        var i4 = i * 4;
        sum += src[i4] * 0.299 + src[i4 + 1] * 0.587 + src[i4 + 2] * 0.114;
      }
      var mean = sum / n / 255;
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var i2 = (y * w + x) * 4;
          var lum = (src[i2] * 0.299 + src[i2 + 1] * 0.587 + src[i2 + 2] * 0.114) / 255;
          var r = 0.5 + (mean - lum) * v;
          r = Math.max(0, Math.min(1, r));
          var g8 = Math.round(r * 255);
          o[i2] = g8; o[i2 + 1] = g8; o[i2 + 2] = g8; o[i2 + 3] = 255;
        }
      }
      oc.putImageData(img, 0, 0);
      return out;
    } catch (e) { return null; }
  }
  var roughCache = {};
  function roughnessTexFor(tex, variance) {
    if (!tex || !tex.image || !tex.image.getContext) return null;
    var key = (tex.uuid || '') + '|r|' + variance;
    if (roughCache[key]) return roughCache[key];
    var c = roughnessFromCanvas(tex.image, variance);
    if (!c) return null;
    var rt = new THREE.CanvasTexture(c);
    rt.wrapS = rt.wrapT = THREE.RepeatWrapping;
    rt.repeat.copy(tex.repeat);
    rt.anisotropy = D.aniso();
    rt.encoding = THREE.LinearEncoding;
    roughCache[key] = rt;
    remember(rt);
    return rt;
  }

  var normalCache = {};
  function normalTexFor(tex, strength) {
    if (!tex || !tex.image || !tex.image.getContext) return null;
    var key = (tex.uuid || '') + '|' + strength;
    if (normalCache[key]) return normalCache[key];
    var c = normalFromCanvas(tex.image, strength);
    if (!c) return null;
    var nt = new THREE.CanvasTexture(c);
    nt.wrapS = nt.wrapT = THREE.RepeatWrapping;
    nt.repeat.copy(tex.repeat);
    nt.anisotropy = D.aniso();
    /* нормал-карта — это данные, а не цвет: гамму к ней применять нельзя */
    nt.encoding = THREE.LinearEncoding;
    normalCache[key] = nt;
    remember(nt);
    return nt;
  }

  /* Прогоняем весь набор материалов: где есть bumpMap — меняем его
     на честную нормал-карту, bumpMap выключаем (иначе считается дважды). */
  D.upgradeMaterials = function (MATS) {
    if (!MATS || lvl === 0) return;
    try {
      var strength = { wall: 1.6, corrWall: 2.6, floor: 1.4, corrFloor: 1.4, wood: 2.2, sofa: 2.0, matt: 1.2 };
      for (var k in MATS) {
        if (!MATS.hasOwnProperty(k)) continue;
        var m = MATS[k];
        if (!m || !m.isMeshStandardMaterial) continue;
        if (m.map) remember(m.map).anisotropy = D.aniso();
        var src = m.bumpMap || m.map;
        if (src && src.image && src.image.getContext) {
          var nt = normalTexFor(src, strength[k] || 1.8);
          if (nt) {
            m.normalMap = nt;
            m.normalScale = new THREE.Vector2(0.85, 0.85);
            m.bumpMap = null;
          }
          var rt = roughnessTexFor(src, 0.3);
          if (rt) m.roughnessMap = rt;
        }
        m.envMapIntensity = 0.55;
        m.needsUpdate = true;
      }
    } catch (e) { warn(e); }
  };

  /* То же самое для отдельно созданного материала (их в игре много) */
  D.upgrade = function (mat, strength) {
    try {
      if (!mat || !mat.isMeshStandardMaterial || lvl === 0) return mat;
      if (mat.map) remember(mat.map).anisotropy = D.aniso();
      var src = mat.bumpMap || mat.map;
      if (src && src.image && src.image.getContext) {
        var nt = normalTexFor(src, strength || 1.8);
        if (nt) { mat.normalMap = nt; mat.bumpMap = null; }
        var rt = roughnessTexFor(src, 0.3);
        if (rt) mat.roughnessMap = rt;
      }
      mat.needsUpdate = true;
    } catch (e) { }
    return mat;
  };

  /* ============================================================
     2. РЕНДЕРЕР: тени, экспозиция, потолок разрешения
     ============================================================ */
  var R = null, S = null, C = null;

  D.upgradeRenderer = function (renderer, scene, camera) {
    R = renderer; S = scene; C = camera;
    window.RENDERER_REF = renderer;
    try {
      renderer.setPixelRatio(D.pixelRatio());
      if (Q().shadow) {
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = (lvl >= 3) ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
        renderer.shadowMap.autoUpdate = true;
      }
      /* физически корректное затухание света — лампа перестаёт
         светить «на всю комнату одинаково» */
      renderer.physicallyCorrectLights = false;
      refreshAniso();      /* теперь предел анизотропии известен — доставляем его */
      makeOverlay();
    } catch (e) { warn(e); }
  };

  /* Солнце отбрасывает тень; лампы — только ближайшая, иначе
     каждая тень это отдельный проход рендера. */
  D.setupLights = function (sunLight, lightPool) {
    try {
      if (!Q().shadow) return;
      if (sunLight) {
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.set(Q().shadow, Q().shadow);
        sunLight.shadow.camera.near = 0.5;
        sunLight.shadow.camera.far = 60;
        var d = 20;
        sunLight.shadow.camera.left = -d; sunLight.shadow.camera.right = d;
        sunLight.shadow.camera.top = d; sunLight.shadow.camera.bottom = -d;
        sunLight.shadow.bias = -0.0015;
        sunLight.shadow.normalBias = 0.02;
      }
      if (lightPool && lightPool[0] && lvl >= 2) {
        var pl = lightPool[0];
        pl.castShadow = true;
        pl.shadow.mapSize.set(512, 512);
        pl.shadow.bias = -0.004;
        pl.shadow.camera.near = 0.15;
        pl.shadow.camera.far = 14;
      }
    } catch (e) { warn(e); }
  };

  /* Фонарь в руках игрока — источник, который двигается каждый кадр,
     поэтому тень от него дороже статичной лампы. Включаем только
     с уровня 2 ("Хорошее"), тем же порогом, что и у остальных теней. */
  D.setupFlashlightShadow = function (spotLight) {
    try {
      if (!Q().shadow || !spotLight || lvl < 2) return;
      spotLight.castShadow = true;
      spotLight.shadow.mapSize.set(Q().shadow, Q().shadow);
      spotLight.shadow.camera.near = 0.08;
      spotLight.shadow.camera.far = spotLight.distance || 20;
      spotLight.shadow.bias = -0.0025;
      spotLight.shadow.normalBias = 0.02;
    } catch (e) { warn(e); }
  };

  /* Каждый добавленный в сцену объект: пол и стены принимают тень,
     мебель ещё и отбрасывает. Крупный плоский объект тень не бросает —
     это пол, от него теней не бывает, а расчёт стоит. */
  D.tagShadow = function (o) {
    try {
      if (!Q().shadow || !o || !o.isMesh) return o;
      o.receiveShadow = true;
      var g = o.geometry;
      if (g && g.parameters) {
        var p = g.parameters;
        var big = (p.width > 12 || p.depth > 12 || p.height > 12);
        o.castShadow = !big;
      } else o.castShadow = true;
    } catch (e) { }
    return o;
  };

  /* ============================================================
     3. ПЫЛЬ В ВОЗДУХЕ
     Облако точек едет за игроком, поэтому пыль есть всегда,
     а точек в сцене — одна порция.
     ============================================================ */
  var dust = null, dustGeo = null, dustBase = null;

  function dustSprite() {
    var c = document.createElement('canvas');
    c.width = c.height = 32;
    var g = c.getContext('2d');
    var gd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gd.addColorStop(0, 'rgba(255,252,244,0.95)');
    gd.addColorStop(0.35, 'rgba(255,250,238,0.35)');
    gd.addColorStop(1, 'rgba(255,250,238,0)');
    g.fillStyle = gd; g.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  }

  D.makeDust = function (scene) {
    try {
      var n = Q().dust;
      if (!n || !scene) return;
      if (dust) { scene.add(dust); return; }
      var pos = new Float32Array(n * 3);
      dustBase = new Float32Array(n);              /* фаза колебания у каждой пылинки своя */
      for (var i = 0; i < n; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 16;
        pos[i * 3 + 1] = Math.random() * 3.2;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 16;
        dustBase[i] = Math.random() * 6.283;
      }
      dustGeo = new THREE.BufferGeometry();
      dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      var mat = new THREE.PointsMaterial({
        size: 0.03, map: dustSprite(), transparent: true, opacity: 0.5,
        depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
      });
      dust = new THREE.Points(dustGeo, mat);
      dust.frustumCulled = false;
      dust.renderOrder = 5;
      scene.add(dust);
    } catch (e) { warn(e); }
  };

  D.removeDust = function (scene) {
    try { if (dust && scene) scene.remove(dust); } catch (e) { }
  };

  /* ============================================================
     4. СВЕТОВЫЕ СТОЛБЫ ОТ ЛАМП
     Конус с прозрачной вершиной и аддитивным смешиванием —
     дешёвая замена объёмному свету.
     ============================================================ */
  D.makeShaft = function (scene, x, y, z, colour, radius, height) {
    try {
      if (!Q().shafts || !scene) return null;
      var geo = new THREE.CylinderGeometry(radius * 0.12, radius, height, 12, 1, true);
      var mat = new THREE.MeshBasicMaterial({
        color: colour === undefined ? 0xfff0d8 : colour,
        transparent: true, opacity: 0.055, side: THREE.DoubleSide,
        depthWrite: false, blending: THREE.AdditiveBlending
      });
      var m = new THREE.Mesh(geo, mat);
      m.position.set(x, y - height / 2, z);
      m.renderOrder = 4;
      scene.add(m);
      return m;
    } catch (e) { return null; }
  };

  /* ============================================================
     5. ВИНЬЕТКА И ЗЕРНО — слой поверх canvas, не в рендере
     ============================================================ */
  var overlay = null;
  function makeOverlay() {
    if (overlay || !Q().grain) return;
    try {
      /* зерно: маленький тайл шума, растянутый повтором */
      var c = document.createElement('canvas');
      c.width = c.height = 64;
      var g = c.getContext('2d');
      var im = g.createImageData(64, 64);
      for (var i = 0; i < 64 * 64; i++) {
        var v = 128 + (Math.random() - 0.5) * 90;
        im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v;
        im.data[i * 4 + 3] = 26;
      }
      g.putImageData(im, 0, 0);

      overlay = document.createElement('div');
      overlay.id = 'detail-overlay';
      overlay.setAttribute('style',
        'position:fixed;inset:0;pointer-events:none;z-index:6;' +
        'background-image:url(' + c.toDataURL() + '),' +
        'radial-gradient(ellipse 78% 78% at 50% 50%,rgba(0,0,0,0) 42%,rgba(0,0,0,.55) 100%);' +
        'background-repeat:repeat,no-repeat;background-size:128px 128px,cover;' +
        'mix-blend-mode:normal;opacity:.9;');
      document.body.appendChild(overlay);
      grainOn = true;
    } catch (e) { warn(e); }
  }
  var grainOn = false;

  /* ============================================================
     6. АВТОКАЧЕСТВО
     Считаем кадры за секунду. Просело ниже 42 три окна подряд —
     снимаем ступень. Держится выше 57 десять секунд — возвращаем.
     Настройка запоминается, поэтому со второго запуска телефон
     сразу стартует на своём уровне.

     Замер приходится защищать от ложных срабатываний. Когда игру
     свернули или переключились на другое приложение, браузер
     перестаёт рисовать кадры — и наивный счётчик видит «один кадр
     в секунду», после чего навсегда роняет качество до худшего.
     Поэтому окно засчитывается, только если экран виден, кадров
     в нём набралось достаточно и не было длинной паузы.
     ============================================================ */
  var frames = 0, winStart = 0, lowRuns = 0, highRuns = 0, grainPhase = 0, locked = false;
  var lastFrameAt = 0;
  var MIN_FRAMES = 20;      /* меньше — судить не о чем */
  var STALL_MS = 250;       /* пауза длиннее — это не низкий FPS, а остановка */

  function resetWindow(now) { frames = 0; winStart = now; lowRuns = 0; highRuns = 0; }

  /* Вернулись на вкладку — начинаем мерить с чистого листа. */
  document.addEventListener('visibilitychange', function () {
    resetWindow(0); lastFrameAt = 0;
  });

  D.lockQuality = function () { locked = true; };

  D.setLevel = function (n) {
    n = Math.max(0, Math.min(3, n));
    if (n === lvl) return;
    lvl = n;
    try {
      localStorage.setItem('magazin_q', String(n));
      localStorage.setItem('magazin_q_rules', QRULES);
    } catch (e) { }
    applyLevel();
  };

  function applyLevel() {
    try {
      if (R) R.setPixelRatio(D.pixelRatio());
      if (R) R.shadowMap.enabled = !!Q().shadow;
      if (dust) dust.visible = Q().dust > 0;
      if (overlay) overlay.style.display = Q().grain ? '' : 'none';
    } catch (e) { }
  }

  /* Лёгкое размытие в движении: резкий поворот или спринт на пару
     кадров стряхивают идеальную резкость, как в кино, а не остаются
     чёткими на любой скорости. Чистый CSS-фильтр на канвасе —
     ни шейдеров, ни лишнего прохода рендера. */
  var motionBlurCur = 0;

  D.tick = function (nowMs, camX, camY, camZ, blurTarget) {
    try {
      if (R && R.domElement) {
        var bt = blurTarget || 0;
        motionBlurCur += (bt - motionBlurCur) * (bt > motionBlurCur ? 0.35 : 0.18);
        R.domElement.style.filter = motionBlurCur > 0.03 ? 'blur(' + motionBlurCur.toFixed(2) + 'px)' : '';
      }
      /* пыль вокруг игрока + лёгкое броуновское движение */
      if (dust && dustGeo && Q().dust) {
        if (camX !== undefined) dust.position.set(camX, 0, camZ);
        var t = nowMs * 0.00035;
        var a = dustGeo.attributes.position, arr = a.array;
        var step = 3;                              /* двигаем треть точек за кадр — экономия */
        for (var i = (frames % step); i < dustBase.length; i += step) {
          var ph = dustBase[i];
          arr[i * 3 + 1] += Math.sin(t + ph) * 0.0018;
          arr[i * 3] += Math.cos(t * 0.7 + ph) * 0.0012;
          if (arr[i * 3 + 1] > 3.4) arr[i * 3 + 1] = 0.05;
          if (arr[i * 3 + 1] < 0.02) arr[i * 3 + 1] = 3.3;
        }
        a.needsUpdate = true;
      }

      /* зерно: сдвигаем тайл, иначе шум «прилипает» к экрану */
      if (grainOn && overlay && (frames & 1) === 0) {
        grainPhase = (grainPhase + 37) % 128;
        overlay.style.backgroundPosition = grainPhase + 'px ' + ((grainPhase * 7) % 128) + 'px, center';
      }

      /* ---------- окно замера FPS ---------- */
      var gap = lastFrameAt ? (nowMs - lastFrameAt) : 0;
      lastFrameAt = nowMs;

      /* Экран не виден или между кадрами была длинная пауза —
         это свёрнутая игра или загрузка уровня, а не слабое железо.
         Такое окно выбрасываем целиком. */
      if (document.hidden || gap > STALL_MS) { resetWindow(nowMs); return; }

      frames++;
      if (!winStart) winStart = nowMs;
      var span = nowMs - winStart;
      if (span >= 1000) {
        if (frames >= MIN_FRAMES) {
          var fps = frames * 1000 / span;
          if (!locked) {
            if (fps < 42) {
              lowRuns++; highRuns = 0;
              if (lowRuns >= 3 && lvl > 0) { D.setLevel(lvl - 1); lowRuns = 0; }
            } else if (fps > 57) {
              highRuns++; lowRuns = 0;
              if (highRuns >= 10 && lvl < 3) { D.setLevel(lvl + 1); highRuns = 0; }
            } else { lowRuns = 0; highRuns = 0; }
          }
        }
        frames = 0; winStart = nowMs;
      }
    } catch (e) { }
  };

  function warn(e) { if (window.console && console.warn) console.warn('[detail]', e); }

  /* ?q=0..3 — зафиксировать качество вручную (для проверки с телефона).
     ?q=auto — забыть запомненный уровень и подобрать заново. */
  try {
    if (/[?&]q=auto\b/.test(location.search)) {
      localStorage.removeItem('magazin_q');
      lvl = guessLevel();
    } else {
      var m = /[?&]q=([0-3])/.exec(location.search);
      if (m) { lvl = parseInt(m[1], 10); locked = true; }
    }
  } catch (e) { }
})();

/* ---------- мост для Vite: тот же объект, что и window.DETAIL ----------
   Легаси-скрипты (part1/part2 пока не модульные) продолжают видеть
   window.DETAIL без изменений; сборка получает то же самое через import. */
export const DETAIL = window.DETAIL;
