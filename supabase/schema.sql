-- prio.coach: Datenbankschema (Supabase / PostgreSQL)
-- Einmal komplett im Supabase SQL Editor ausführen. Das Skript lässt sich gefahrlos erneut ausführen.
--
-- Grundsatz: Inhalte (Projekte, Beschreibungen, Priorisierungen) sieht nur die Person selbst.
-- Kursbeitritt und Freigabe sind getrennt: Coaches sehen von Mitgliedern nur den Anzeigenamen;
-- Kennzahlen (member_stats) erst, wenn die Person das Teilen für diesen Kurs einschaltet.
-- Das Teilen lässt sich jederzeit ein- und ausschalten. Das erzwingt die Datenbank (Row Level Security),
-- nicht nur die Oberfläche.

-- ---------------------------------------------------------------------------
-- 1. Arbeitsstand je Person (Paarvergleich + Wochenplanung als JSON)
-- ---------------------------------------------------------------------------
create table if not exists public.user_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_state enable row level security;

drop policy if exists "user_state: eigene Zeile" on public.user_state;
create policy "user_state: eigene Zeile" on public.user_state
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. Kurse und Mitgliedschaften
-- ---------------------------------------------------------------------------
create table if not exists public.courses (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name       text not null check (char_length(name) between 1 and 80),
  coach_id   uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.courses enable row level security;

create table if not exists public.course_members (
  course_id    uuid not null references public.courses (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  share        boolean not null default false,  -- Kennzahlen für diesen Kurs freigegeben?
  consent_at   timestamptz,                     -- Zeitpunkt der (letzten) Freigabe
  joined_at    timestamptz not null default now(),
  primary key (course_id, user_id)
);
alter table public.course_members enable row level security;

-- Umstellung bestehender Datenbanken: Wer vorher beigetreten ist, hatte dabei zugestimmt
-- und behält die Freigabe (Spalte wird mit true angelegt, danach gilt false als Standard).
alter table public.course_members add column if not exists share boolean not null default true;
alter table public.course_members alter column share set default false;
alter table public.course_members alter column consent_at drop not null;
alter table public.course_members alter column consent_at drop default;

-- Hilfsfunktionen (security definer, damit sich die Policies nicht gegenseitig rekursiv prüfen)
create or replace function public.is_course_coach(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.courses where id = c and coach_id = auth.uid());
$$;

create or replace function public.is_course_member(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.course_members where course_id = c and user_id = auth.uid());
$$;

-- Kennzahlen sichtbar nur bei Freigabe für einen Kurs dieses Coaches.
create or replace function public.coaches_member(u uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.course_members m join public.courses c on c.id = m.course_id
    where m.user_id = u and m.share and c.coach_id = auth.uid()
  );
$$;

-- Kurse: Coach verwaltet eigene Kurse; Mitglieder sehen Name und Code ihrer Kurse.
drop policy if exists "courses: coach verwaltet" on public.courses;
create policy "courses: coach verwaltet" on public.courses
  for all to authenticated
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

drop policy if exists "courses: mitglieder lesen" on public.courses;
create policy "courses: mitglieder lesen" on public.courses
  for select to authenticated
  using (public.is_course_member(id));

-- Mitgliedschaften: eigene sehen und verlassen; Coach sieht und entfernt Mitglieder seiner Kurse.
-- Beitreten nur über join_course() (prüft den Code, setzt die Freigabe).
drop policy if exists "members: eigene lesen" on public.course_members;
create policy "members: eigene lesen" on public.course_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_course_coach(course_id));

drop policy if exists "members: verlassen oder entfernen" on public.course_members;
create policy "members: verlassen oder entfernen" on public.course_members
  for delete to authenticated
  using (user_id = auth.uid() or public.is_course_coach(course_id));

-- Ändern nur über set_course_sharing() (keine direkte Update-Regel, damit niemand
-- seine Mitgliedschaft in einen anderen Kurs umschreiben kann).
drop policy if exists "members: anzeigename ändern" on public.course_members;

-- ---------------------------------------------------------------------------
-- 3. Kennzahlen (das Einzige, was ein Coach von einer Person sieht)
-- ---------------------------------------------------------------------------
create table if not exists public.member_stats (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  stats      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.member_stats enable row level security;

drop policy if exists "stats: eigene schreiben" on public.member_stats;
create policy "stats: eigene schreiben" on public.member_stats
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "stats: coach liest kursmitglieder" on public.member_stats;
create policy "stats: coach liest kursmitglieder" on public.member_stats
  for select to authenticated
  using (public.coaches_member(user_id));

-- ---------------------------------------------------------------------------
-- 4. Funktionen für die App
-- ---------------------------------------------------------------------------
-- Kurs anlegen mit zufälligem, gut lesbarem Code (ohne 0/O/1/I).
create or replace function public.create_course(course_name text)
returns public.courses language plpgsql security definer set search_path = public as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  new_code text;
  result public.courses;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  loop
    new_code := 'PRIO-';
    for i in 1..4 loop
      new_code := new_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.courses where code = new_code);
  end loop;
  insert into public.courses (code, name, coach_id) values (new_code, trim(course_name), auth.uid())
  returning * into result;
  return result;
end;
$$;

-- Kurs per Code beitreten; Teilen der Kennzahlen optional (auch später möglich).
drop function if exists public.join_course(text, text);
create or replace function public.join_course(course_code text, name text, share_stats boolean default false)
returns public.courses language plpgsql security definer set search_path = public as $$
declare
  c public.courses;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into c from public.courses where code = upper(trim(course_code));
  if not found then raise exception 'Kurs nicht gefunden'; end if;
  insert into public.course_members (course_id, user_id, display_name, share, consent_at)
  values (c.id, auth.uid(), trim(name), share_stats, case when share_stats then now() end)
  on conflict (course_id, user_id) do update
    set display_name = excluded.display_name,
        share = excluded.share,
        consent_at = case when excluded.share then now() else null end;
  return c;
end;
$$;

-- Teilen der Kennzahlen für einen Kurs ein- oder ausschalten.
create or replace function public.set_course_sharing(course uuid, share_stats boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update public.course_members
     set share = share_stats, consent_at = case when share_stats then now() else null end
   where course_id = course and user_id = auth.uid();
  if not found then raise exception 'Kein Mitglied dieses Kurses'; end if;
end;
$$;

-- Konto vollständig löschen (alle Tabellen hängen per "on delete cascade" am Konto).
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.create_course(text) from public, anon;
revoke all on function public.join_course(text, text, boolean) from public, anon;
revoke all on function public.set_course_sharing(uuid, boolean) from public, anon;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.create_course(text) to authenticated;
grant execute on function public.join_course(text, text, boolean) to authenticated;
grant execute on function public.set_course_sharing(uuid, boolean) to authenticated;
grant execute on function public.delete_my_account() to authenticated;

-- Kein Zugriff für nicht angemeldete Besucher.
revoke all on public.user_state, public.courses, public.course_members, public.member_stats from anon;
grant select, insert, update, delete on public.user_state, public.courses, public.member_stats to authenticated;
-- Mitgliedschaften: lesen und verlassen direkt, alles andere nur über die Funktionen oben.
revoke insert, update on public.course_members from authenticated;
grant select, delete on public.course_members to authenticated;
