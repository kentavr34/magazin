-- ============================================================
--  СХЕМА БАЗЫ ДЛЯ «ЗАБРОШЕННОГО МАГАЗИНА»
--  Claude Code: выполнить целиком в Supabase → SQL Editor.
--  Скрипт можно запускать повторно, он не ломает существующее.
-- ============================================================

-- ---------- профили ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nick        text unique,                 -- он же логин; null пока не задан
  temp_name   text,                        -- временное имя до привязки ника
  created_at  timestamptz not null default now()
);

-- ---------- сохранения ----------
-- одна строка на игрока и часть игры
create table if not exists public.saves (
  user_id     uuid not null references auth.users(id) on delete cascade,
  part        int  not null,               -- 1 или 2
  checkpoint  text,                        -- id точки сохранения
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (user_id, part)
);

-- ---------- защита данных ----------
-- Каждый игрок видит и меняет ТОЛЬКО своё. Это то, что делает
-- публичный anon-ключ безопасным: без входа он не даёт ничего.
alter table public.profiles enable row level security;
alter table public.saves    enable row level security;

drop policy if exists "profiles_own" on public.profiles;
create policy "profiles_own" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "saves_own" on public.saves;
create policy "saves_own" on public.saves
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- права для REST API ----------
-- Нужно для проектов, созданных после 30 мая 2026: без явных grant
-- таблицы не видны через Data API.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.saves    to authenticated;

-- ---------- проверка занятости ника до регистрации ----------
create or replace function public.nick_taken(p_nick text)
returns boolean language sql security definer stable as $$
  select exists(select 1 from public.profiles where lower(nick)=lower(p_nick));
$$;
grant execute on function public.nick_taken(text) to anon, authenticated;
