/* ============================================================
   Profile — кто играет и где его прогресс
   ------------------------------------------------------------
   Раньше этим занимался Supabase. Теперь всё своё: наш сервер,
   наша база, никаких ключей в открытом репозитории и никаких
   чужих ограничений на бесплатном тарифе.

   Как это выглядит для игрока:
     · зашёл — уже играешь, регистрации нет, ник выдан сам;
     · захотел продолжить с другого телефона — задал ник и пароль,
       прогресс при этом НЕ теряется, он остаётся у того же игрока;
     · зашёл по нику с другого устройства — прогресс на месте.

   Нет сети — игра всё равно идёт: прогресс копится на устройстве
   и уезжает на сервер, как только связь появится.
   ============================================================ */
(function (global) {
  'use strict';

  var API = (global.MAGAZIN_API || '/api').replace(/\/$/, '');
  var LS_TOKEN = 'magazin_token';
  var LS_LOCAL = 'magazin_save_';       /* + номер части */
  var LS_DIRTY = 'magazin_dirty';       /* что не доехало до сервера */

  var Profile = {
    online: false,
    nick: null,
    id: null,
    lastError: null,
    ready: false
  };

  /* ---------- хранилище устройства ---------- */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { } }

  function token() { return lsGet(LS_TOKEN); }

  /* ---------- обращение к серверу ---------- */
  function call(method, path, body, cb) {
    var opt = {
      method: method,
      headers: { 'Accept': 'application/json' },
      cache: 'no-store'
    };
    var t = token();
    if (t) opt.headers['Authorization'] = 'Bearer ' + t;
    if (body !== undefined && body !== null) {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(body);
    }
    var done = false;
    /* Сервер может лежать, а игра ждать не должна: восемь секунд и хватит. */
    var timer = setTimeout(function () {
      if (done) return; done = true;
      cb({ ok: false, offline: true, error: 'сервер не отвечает' });
    }, 8000);

    fetch(API + path, opt)
      .then(function (r) {
        return r.json().catch(function () { return {}; })
          .then(function (j) { return { status: r.status, body: j }; });
      })
      .then(function (r) {
        if (done) return; done = true; clearTimeout(timer);
        if (r.status >= 200 && r.status < 300) cb({ ok: true, data: r.body });
        else cb({ ok: false, status: r.status, error: r.body.error || ('ошибка ' + r.status) });
      })
      .catch(function () {
        if (done) return; done = true; clearTimeout(timer);
        cb({ ok: false, offline: true, error: 'нет связи' });
      });
  }

  function apply(d) {
    Profile.id = d.id;
    Profile.nick = d.nick || null;
    Profile.online = true;
    Profile.lastError = null;
    if (d.token) lsSet(LS_TOKEN, d.token);
  }

  /* ============================================================
     Запуск
     ============================================================ */
  Profile.init = function (cb) {
    cb = cb || function () { };
    var finish = function () { Profile.ready = true; flush(); cb(Profile); };

    if (!token()) return guest(finish);

    call('GET', '/me', null, function (r) {
      if (r.ok) { apply(r.data); return finish(); }
      if (r.offline) {
        /* Сети нет — играем как есть, с прогрессом на устройстве. */
        Profile.online = false;
        Profile.lastError = r.error;
        return finish();
      }
      /* Токен протух или база потеряна — заводим нового гостя.
         Прогресс на устройстве при этом остаётся. */
      lsDel(LS_TOKEN);
      guest(finish);
    });
  };

  function guest(done) {
    call('POST', '/guest', {}, function (r) {
      if (r.ok) apply(r.data);
      else { Profile.online = false; Profile.lastError = r.error; }
      done();
    });
  }

  Profile.displayName = function () {
    if (Profile.nick) return Profile.nick;
    if (Profile.id) return 'Игрок-' + Profile.id.slice(0, 4).toUpperCase();
    return 'Игрок';
  };

  /* ============================================================
     Ник и пароль
     ============================================================ */
  Profile.claim = function (nick, pass, cb) {
    cb = cb || function () { };
    if (!Profile.online) return cb({ ok: false, msg: 'Нет связи с сервером' });
    call('POST', '/claim', { nick: nick, pass: pass }, function (r) {
      if (!r.ok) return cb({ ok: false, msg: r.error });
      apply(r.data);
      cb({ ok: true });
    });
  };

  Profile.login = function (nick, pass, cb) {
    cb = cb || function () { };
    call('POST', '/login', { nick: nick, pass: pass }, function (r) {
      if (!r.ok) return cb({ ok: false, msg: r.error });
      apply(r.data);
      /* Пришли под другим игроком — прогресс прежнего с устройства убираем,
         иначе чужое сохранение затрёт своё при первой же записи. */
      lsDel(LS_LOCAL + '1'); lsDel(LS_LOCAL + '2'); lsDel(LS_DIRTY);
      cb({ ok: true });
    });
  };

  Profile.logout = function (cb) {
    lsDel(LS_TOKEN); lsDel(LS_LOCAL + '1'); lsDel(LS_LOCAL + '2'); lsDel(LS_DIRTY);
    Profile.nick = null; Profile.id = null; Profile.online = false;
    if (cb) cb();
  };

  /* ============================================================
     Прогресс
     ------------------------------------------------------------
     Пишем всегда сразу на устройство — это мгновенно и не зависит
     от сети. На сервер отправляем следом; не ушло — запоминаем
     и досылаем при первой возможности.
     ============================================================ */
  Profile.save = function (part, data, cb) {
    cb = cb || function () { };
    part = Number(part) || 1;
    try { lsSet(LS_LOCAL + part, JSON.stringify({ data: data, at: Date.now() })); } catch (e) { }

    if (!Profile.online) { markDirty(part); return cb({ ok: true, local: true }); }
    call('PUT', '/save/' + part, { data: data }, function (r) {
      if (!r.ok) { markDirty(part); return cb({ ok: true, local: true, msg: r.error }); }
      unmarkDirty(part);
      cb({ ok: true });
    });
  };

  Profile.load = function (part, cb) {
    cb = cb || function () { };
    part = Number(part) || 1;
    var local = null;
    try {
      var raw = lsGet(LS_LOCAL + part);
      if (raw) local = JSON.parse(raw);
    } catch (e) { }

    if (!Profile.online) return cb(local ? local.data : null);

    call('GET', '/save/' + part, null, function (r) {
      if (!r.ok) return cb(local ? local.data : null);
      var cloud = r.data && r.data.data ? r.data.data : null;
      var cloudAt = r.data && r.data.updated_at ? r.data.updated_at : 0;

      /* Берём то, что новее. Иначе вход с телефона, на котором давно
         не играли, откатил бы прохождение. */
      if (local && cloud) return cb(local.at > cloudAt ? local.data : cloud);
      cb(cloud || (local ? local.data : null));
    });
  };

  /* ---------- досылка того, что не уехало ---------- */
  function dirty() {
    try { return JSON.parse(lsGet(LS_DIRTY) || '[]'); } catch (e) { return []; }
  }
  function markDirty(part) {
    var d = dirty();
    if (d.indexOf(part) === -1) { d.push(part); lsSet(LS_DIRTY, JSON.stringify(d)); }
  }
  function unmarkDirty(part) {
    var d = dirty().filter(function (x) { return x !== part; });
    if (d.length) lsSet(LS_DIRTY, JSON.stringify(d)); else lsDel(LS_DIRTY);
  }

  function flush() {
    if (!Profile.online) return;
    dirty().forEach(function (part) {
      var raw = lsGet(LS_LOCAL + part);
      if (!raw) return unmarkDirty(part);
      var parsed;
      try { parsed = JSON.parse(raw); } catch (e) { return unmarkDirty(part); }
      call('PUT', '/save/' + part, { data: parsed.data }, function (r) {
        if (r.ok) unmarkDirty(part);
      });
    });
  }

  global.addEventListener('online', function () {
    if (!Profile.ready) return;
    if (!Profile.online) Profile.init();
    else flush();
  });

  global.Profile = Profile;
})(window);
