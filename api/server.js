/* ============================================================
   magazin-api — профили и прогресс игроков
   ------------------------------------------------------------
   Ни одной внешней библиотеки: только то, что уже есть в Node.
   Причина простая — библиотеки ломаются при обновлении, а игру
   должен уметь чинить один человек за один вечер. База — файл
   SQLite рядом, встроенным модулем node:sqlite.

   Что умеет:
     POST /api/guest          завести гостя, вернуть токен и ник
     POST /api/claim          закрепить ник и пароль за гостем
     POST /api/login          войти по нику с другого устройства
     GET  /api/me             кто я
     GET  /api/save/:part     прогресс части
     PUT  /api/save/:part     сохранить прогресс
     GET  /api/health         жив ли

   Токен передаётся заголовком: Authorization: Bearer <токен>
   ============================================================ */
'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const PORT = Number(process.env.PORT || 8080);
const DB_PATH = process.env.DB_PATH || '/data/magazin.db';
const MAX_BODY = 256 * 1024;          /* сохранение крупнее — точно ошибка */

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;

  CREATE TABLE IF NOT EXISTS players (
    id         TEXT PRIMARY KEY,
    nick       TEXT UNIQUE,          -- NULL пока игрок гость
    nick_low   TEXT UNIQUE,          -- для поиска без учёта регистра
    pass_hash  TEXT,
    pass_salt  TEXT,
    created_at INTEGER NOT NULL,
    seen_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tokens (
    token      TEXT PRIMARY KEY,
    player_id  TEXT NOT NULL REFERENCES players(id),
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS saves (
    player_id  TEXT NOT NULL REFERENCES players(id),
    part       INTEGER NOT NULL,
    data       TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (player_id, part)
  );

  CREATE INDEX IF NOT EXISTS idx_tokens_player ON tokens(player_id);
`);

/* ---------- мелкие помощники ---------- */
const now = () => Date.now();
const rnd = (n) => crypto.randomBytes(n).toString('hex');

/* Ник гостя: Игрок-A1B2. Буквы без похожих друг на друга (0/O, 1/I) —
   ник придётся диктовать вслух и вводить руками. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function guestNick() {
  let s = '';
  for (let i = 0; i < 4; i++) s += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return 'Игрок-' + s;
}

/* Пароль хранится не как пароль, а как scrypt-отпечаток с солью.
   Даже если базу украдут, паролей в ней нет. */
function hashPass(pass, salt) {
  return crypto.scryptSync(pass, salt, 32, { N: 16384, r: 8, p: 1 }).toString('hex');
}
function checkPass(pass, salt, expected) {
  const got = Buffer.from(hashPass(pass, salt), 'hex');
  const want = Buffer.from(expected, 'hex');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

/* ---------- запросы к базе ---------- */
const q = {
  insertPlayer: db.prepare(
    'INSERT INTO players (id,nick,nick_low,created_at,seen_at) VALUES (?,?,?,?,?)'),
  playerById: db.prepare('SELECT * FROM players WHERE id = ?'),
  playerByNick: db.prepare('SELECT * FROM players WHERE nick_low = ?'),
  touchPlayer: db.prepare('UPDATE players SET seen_at = ? WHERE id = ?'),
  setNick: db.prepare(
    'UPDATE players SET nick = ?, nick_low = ?, pass_hash = ?, pass_salt = ? WHERE id = ?'),
  insertToken: db.prepare('INSERT INTO tokens (token,player_id,created_at) VALUES (?,?,?)'),
  tokenRow: db.prepare('SELECT * FROM tokens WHERE token = ?'),
  getSave: db.prepare('SELECT data, updated_at FROM saves WHERE player_id = ? AND part = ?'),
  putSave: db.prepare(`INSERT INTO saves (player_id,part,data,updated_at) VALUES (?,?,?,?)
                       ON CONFLICT(player_id,part) DO UPDATE
                       SET data = excluded.data, updated_at = excluded.updated_at`),
  allSaves: db.prepare('SELECT part, updated_at FROM saves WHERE player_id = ?')
};

function newPlayer() {
  const id = rnd(16);
  const t = now();
  q.insertPlayer.run(id, null, null, t, t);
  const token = rnd(32);
  q.insertToken.run(token, id, t);
  return { id, token };
}

/* ---------- защита от перебора пароля ----------
   Пять неудачных попыток с одного адреса — пауза на минуту.
   Ник игрока короткий, без этого его подобрали бы за вечер. */
const failures = new Map();
function tooManyFailures(ip) {
  const f = failures.get(ip);
  if (!f) return false;
  if (now() - f.at > 60000) { failures.delete(ip); return false; }
  return f.n >= 5;
}
function noteFailure(ip) {
  const f = failures.get(ip);
  if (!f || now() - f.at > 60000) failures.set(ip, { n: 1, at: now() });
  else { f.n++; f.at = now(); }
}
/* Карта не должна расти вечно */
setInterval(() => {
  const t = now();
  for (const [ip, f] of failures) if (t - f.at > 120000) failures.delete(ip);
}, 60000).unref();

/* ---------- разбор запроса ---------- */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('слишком большой запрос')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(new Error('не разобрал JSON')); }
    });
    req.on('error', reject);
  });
}

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function whoIs(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+([a-f0-9]{16,128})$/i.exec(h);
  if (!m) return null;
  const row = q.tokenRow.get(m[1]);
  if (!row) return null;
  const p = q.playerById.get(row.player_id);
  if (p) q.touchPlayer.run(now(), p.id);
  return p || null;
}

function publicView(p, token) {
  return {
    id: p.id,
    nick: p.nick,
    guest: !p.nick,
    displayName: p.nick || 'Игрок-' + p.id.slice(0, 4).toUpperCase(),
    token: token || undefined
  };
}

/* ---------- проверка ника и пароля ---------- */
function validateNick(nick) {
  if (typeof nick !== 'string') return 'ник не указан';
  nick = nick.trim();
  if (nick.length < 3) return 'ник короче трёх букв';
  if (nick.length > 20) return 'ник длиннее двадцати букв';
  /* Кириллица, латиница, цифры, дефис и подчёркивание.
     Пробелы запрещены: ник вводят руками, и лишний пробел
     на конце — верный способ не попасть в свой же профиль. */
  if (!/^[A-Za-zА-Яа-яЁё0-9_-]+$/.test(nick)) return 'в нике только буквы, цифры, дефис';
  return null;
}
function validatePass(pass) {
  if (typeof pass !== 'string') return 'пароль не указан';
  if (pass.length < 4) return 'пароль короче четырёх знаков';
  if (pass.length > 100) return 'пароль слишком длинный';
  return null;
}

/* ============================================================
   Маршруты
   ============================================================ */
const routes = {
  'GET /api/health': (req, res) => send(res, 200, { ok: true, time: now() }),

  /* Гость. Регистрации нет, играть можно сразу. */
  'POST /api/guest': (req, res) => {
    const { id, token } = newPlayer();
    const p = q.playerById.get(id);
    send(res, 200, publicView(p, token));
  },

  'GET /api/me': (req, res) => {
    const p = whoIs(req);
    if (!p) return send(res, 401, { error: 'не узнал' });
    send(res, 200, publicView(p));
  },

  /* Закрепить ник за собой. ВАЖНО: игрок остаётся тем же,
     поэтому прогресс, набранный гостем, никуда не девается. */
  'POST /api/claim': async (req, res) => {
    const p = whoIs(req);
    if (!p) return send(res, 401, { error: 'не узнал' });
    if (p.nick) return send(res, 409, { error: 'ник уже задан: ' + p.nick });

    const body = await readBody(req);
    const nick = String(body.nick || '').trim();
    const pass = String(body.pass || '');
    const e1 = validateNick(nick); if (e1) return send(res, 400, { error: e1 });
    const e2 = validatePass(pass); if (e2) return send(res, 400, { error: e2 });

    if (q.playerByNick.get(nick.toLowerCase())) {
      return send(res, 409, { error: 'такой ник уже занят' });
    }
    const salt = rnd(16);
    try {
      q.setNick.run(nick, nick.toLowerCase(), hashPass(pass, salt), salt, p.id);
    } catch (err) {
      return send(res, 409, { error: 'такой ник уже занят' });
    }
    send(res, 200, publicView(q.playerById.get(p.id)));
  },

  /* Вход с другого устройства. */
  'POST /api/login': async (req, res) => {
    const ip = req.socket.remoteAddress || '?';
    if (tooManyFailures(ip)) {
      return send(res, 429, { error: 'слишком много попыток, подождите минуту' });
    }
    const body = await readBody(req);
    const nick = String(body.nick || '').trim();
    const pass = String(body.pass || '');
    if (!nick || !pass) return send(res, 400, { error: 'нужен ник и пароль' });

    const p = q.playerByNick.get(nick.toLowerCase());
    if (!p || !p.pass_hash || !checkPass(pass, p.pass_salt, p.pass_hash)) {
      noteFailure(ip);
      /* Не говорим, что именно не сошлось: иначе ники можно перебрать. */
      return send(res, 401, { error: 'ник или пароль не подходят' });
    }
    const token = rnd(32);
    q.insertToken.run(token, p.id, now());
    q.touchPlayer.run(now(), p.id);
    send(res, 200, publicView(p, token));
  },

  'GET /api/saves': (req, res) => {
    const p = whoIs(req);
    if (!p) return send(res, 401, { error: 'не узнал' });
    send(res, 200, { saves: q.allSaves.all(p.id) });
  }
};

/* ---------- сервер ---------- */
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const key = req.method + ' ' + url.pathname;

    if (routes[key]) return await routes[key](req, res);

    /* прогресс части: /api/save/1, /api/save/2.
       /api/save/0 — служебный слот: не сохранение внутри игры,
       а метки вида "часть I пройдена", по которым index.html
       решает, открывать ли часть II. Тот же протокол, та же
       офлайн-логика — не пришлось заводить отдельный endpoint. */
    const m = /^\/api\/save\/([0-9])$/.exec(url.pathname);
    if (m) {
      const p = whoIs(req);
      if (!p) return send(res, 401, { error: 'не узнал' });
      const part = Number(m[1]);

      if (req.method === 'GET') {
        const row = q.getSave.get(p.id, part);
        if (!row) return send(res, 200, { data: null });
        return send(res, 200, { data: JSON.parse(row.data), updated_at: row.updated_at });
      }
      if (req.method === 'PUT') {
        const body = await readBody(req);
        if (body.data === undefined) return send(res, 400, { error: 'нет поля data' });
        q.putSave.run(p.id, part, JSON.stringify(body.data), now());
        return send(res, 200, { ok: true });
      }
      return send(res, 405, { error: 'не тот метод' });
    }

    send(res, 404, { error: 'нет такого адреса' });
  } catch (err) {
    send(res, 400, { error: String(err.message || err) });
  }
});

server.listen(PORT, () => {
  console.log('magazin-api слушает :' + PORT + ', база ' + DB_PATH);
});

/* Корректная остановка: docker присылает SIGTERM, база должна закрыться,
   иначе в WAL останется хвост. */
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    server.close(() => { try { db.close(); } catch (e) { } process.exit(0); });
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
