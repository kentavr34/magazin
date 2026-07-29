// ============================================================
//  ПРОФИЛЬ И ПРОГРЕСС
//
//  Как это работает:
//   1. Первый запуск  — игрок не вводит ничего. Создаётся анонимный
//      аккаунт, его номер лежит в памяти браузера. Прогресс уже
//      пишется в облако.
//   2. Захотел перенести — открыл профиль, задал НИК и ПАРОЛЬ.
//      Ник и есть логин. Анонимный аккаунт превращается в постоянный,
//      прогресс не теряется.
//   3. Другое устройство — вошёл по нику и паролю, получил свой прогресс.
//
//  Если сети нет или Supabase не настроен — всё работает локально,
//  игра не ломается. Это важно: сначала выкладываем на Pages,
//  сервер подключаем следом.
// ============================================================
(function(){
  var CFG = window.GAME_CONFIG || {};
  var LS_DEVICE = 'as_device_id';
  var LS_LOCAL  = 'as_local_save_';

  var Profile = {
    ready:false, online:false, user:null, nick:null, sb:null, lastError:null
  };

  // ---------- вспомогательное ----------
  function uuid(){
    if(window.crypto&&crypto.randomUUID)return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){
      var r=Math.random()*16|0, v=c==='x'?r:(r&0x3|0x8);return v.toString(16);
    });
  }
  function lsGet(k){try{return localStorage.getItem(k);}catch(e){return null;}}
  function lsSet(k,v){try{localStorage.setItem(k,v);}catch(e){}}
  function emailOf(nick){return String(nick).trim().toLowerCase()+'@'+CFG.EMAIL_DOMAIN;}
  function configured(){
    return CFG.SUPABASE_URL && CFG.SUPABASE_URL.indexOf('ВСТАВЬ')<0 &&
           CFG.SUPABASE_ANON_KEY && CFG.SUPABASE_ANON_KEY.indexOf('ВСТАВЬ')<0;
  }

  // ---------- запуск ----------
  Profile.init = function(cb){
    cb = cb || function(){};
    if(!lsGet(LS_DEVICE)) lsSet(LS_DEVICE, uuid());
    if(!configured() || !window.supabase){
      Profile.ready=true; Profile.online=false;
      Profile.lastError = window.supabase ? 'не заданы ключи Supabase'
                                          : 'библиотека supabase-js не загружена';
      return cb(Profile);
    }
    try{
      Profile.sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
        auth:{ persistSession:true, autoRefreshToken:true }
      });
    }catch(e){
      Profile.ready=true;Profile.online=false;Profile.lastError=String(e.message||e);
      return cb(Profile);
    }
    Profile.sb.auth.getSession().then(function(res){
      var sess = res && res.data && res.data.session;
      if(sess && sess.user){ afterAuth(sess.user, cb); return; }
      // анонимный вход — без регистрации, без почты
      Profile.sb.auth.signInAnonymously().then(function(r){
        if(r.error){ fail(r.error, cb); return; }
        afterAuth(r.data.user, cb);
      }).catch(function(e){ fail(e, cb); });
    }).catch(function(e){ fail(e, cb); });
  };
  function fail(e, cb){
    Profile.ready=true;Profile.online=false;
    Profile.lastError=String((e&&e.message)||e);
    cb(Profile);
  }
  function afterAuth(user, cb){
    Profile.user=user; Profile.online=true; Profile.ready=true;
    Profile.sb.from('profiles').select('nick').eq('id',user.id).maybeSingle()
      .then(function(r){
        if(r.data && r.data.nick){ Profile.nick=r.data.nick; cb(Profile); return; }
        // создаём строку профиля с временным именем
        var temp='Игрок-'+String(user.id).slice(0,4).toUpperCase();
        Profile.sb.from('profiles').upsert({id:user.id, nick:null, temp_name:temp})
          .then(function(){ Profile.nick=null; Profile.tempName=temp; cb(Profile); })
          .catch(function(){ cb(Profile); });
      })
      .catch(function(){ cb(Profile); });
  }

  // ---------- привязка ника и пароля ----------
  // Ник = логин. Почта не спрашивается: подставляем ник@домен-заглушку.
  Profile.claim = function(nick, password, cb){
    cb = cb || function(){};
    nick = String(nick||'').trim();
    if(nick.length<3) return cb({ok:false, msg:'Ник должен быть от 3 символов'});
    if(String(password||'').length<6) return cb({ok:false, msg:'Пароль от 6 символов'});
    if(!Profile.online) return cb({ok:false, msg:'Нет связи с сервером'});
    Profile.sb.auth.updateUser({ email: emailOf(nick), password: password })
      .then(function(r){
        if(r.error) return cb({ok:false, msg:msgOf(r.error)});
        return Profile.sb.from('profiles')
          .upsert({id:Profile.user.id, nick:nick})
          .then(function(r2){
            if(r2.error) return cb({ok:false, msg:'Такой ник уже занят'});
            Profile.nick=nick;
            cb({ok:true});
          });
      })
      .catch(function(e){ cb({ok:false, msg:msgOf(e)}); });
  };

  // ---------- вход с другого устройства ----------
  Profile.login = function(nick, password, cb){
    cb = cb || function(){};
    if(!Profile.online) return cb({ok:false, msg:'Нет связи с сервером'});
    Profile.sb.auth.signInWithPassword({ email: emailOf(nick), password: password })
      .then(function(r){
        if(r.error) return cb({ok:false, msg:'Неверный ник или пароль'});
        afterAuth(r.data.user, function(){ cb({ok:true}); });
      })
      .catch(function(e){ cb({ok:false, msg:msgOf(e)}); });
  };
  Profile.logout = function(cb){
    if(Profile.online && Profile.sb) Profile.sb.auth.signOut();
    Profile.user=null;Profile.nick=null;
    if(cb)cb();
  };
  function msgOf(e){
    var m=String((e&&e.message)||e);
    if(m.indexOf('already registered')>=0) return 'Такой ник уже занят';
    return m;
  }

  // ---------- прогресс ----------
  // part: 1 или 2. data: любой объект (точка сохранения, снаряжение и т.д.)
  Profile.save = function(part, data, cb){
    cb = cb || function(){};
    lsSet(LS_LOCAL+part, JSON.stringify({part:part, data:data, at:Date.now()}));
    if(!Profile.online || !Profile.user) return cb({ok:true, where:'локально'});
    Profile.sb.from('saves').upsert({
      user_id: Profile.user.id, part: part,
      checkpoint: (data&&data.id)||null,
      data: data, updated_at: new Date().toISOString()
    }, {onConflict:'user_id,part'})
      .then(function(r){
        if(r.error) return cb({ok:true, where:'локально', msg:r.error.message});
        cb({ok:true, where:'облако'});
      })
      .catch(function(e){ cb({ok:true, where:'локально', msg:String(e)}); });
  };
  Profile.load = function(part, cb){
    cb = cb || function(){};
    var local=null;
    try{ var raw=lsGet(LS_LOCAL+part); if(raw) local=JSON.parse(raw); }catch(e){}
    if(!Profile.online || !Profile.user) return cb(local?local.data:null, 'локально');
    Profile.sb.from('saves').select('data,updated_at').eq('user_id',Profile.user.id)
      .eq('part',part).maybeSingle()
      .then(function(r){
        if(r.error || !r.data) return cb(local?local.data:null, 'локально');
        // берём более свежее
        var cloudAt=new Date(r.data.updated_at).getTime();
        if(local && local.at > cloudAt) return cb(local.data,'локально');
        cb(r.data.data,'облако');
      })
      .catch(function(){ cb(local?local.data:null,'локально'); });
  };
  Profile.displayName = function(){
    return Profile.nick || Profile.tempName || 'Гость';
  };

  window.Profile = Profile;
})();
