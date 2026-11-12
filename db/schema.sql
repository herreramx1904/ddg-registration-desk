-- DDG Registration Desk: full Must-tier schema (owned by T1 / lead). Idempotent.
-- Security: RLS ON for every table and NO policies => anon/publishable key can read/write nothing.
-- Only the server (secret key, bypasses RLS) touches data.

create extension if not exists pgcrypto;

create table if not exists imports (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  staff text not null,
  file_name text,
  report jsonb not null
);

create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'registered' check (status in ('registered','cancelled','do_not_admit')),
  created_at timestamptz not null default now()
);

create table if not exists registrations (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  import_id uuid references imports(id) on delete set null,
  row_number int not null,
  reg_id text not null,
  reg_id_generated boolean not null default false,
  first_name text not null,
  last_name text not null,
  company text,
  guest_type text not null,
  breakout text,
  search_text text not null,          -- accent/case-folded "first last company regid"
  raw jsonb not null,                 -- original row, untouched
  clean jsonb not null,               -- CleanFields
  flags jsonb not null default '[]',  -- Flag[]
  changes jsonb not null default '[]',
  desk_note text,
  manager_notes text,                 -- MANAGER ONLY
  ticket_token text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists registrations_person_idx on registrations(person_id);

create table if not exists duplicate_suggestions (
  id uuid primary key default gen_random_uuid(),
  registration_a uuid not null references registrations(id) on delete cascade,
  registration_b uuid not null references registrations(id) on delete cascade,
  strength text not null check (strength in ('strong','medium','weak')),
  reason text not null,
  decision text not null default 'pending' check (decision in ('pending','confirmed','rejected')),
  decided_by text,
  decided_at timestamptz
);

create table if not exists checkins (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  registration_id uuid references registrations(id) on delete set null,
  at timestamptz not null default now(),
  staff text not null,
  via text not null default 'search' check (via in ('search','qr','manager')),
  override text check (override in ('cancelled_confirmed','manager_override')),
  undone_at timestamptz,
  undone_by text
);
-- THE double check-in guard: at most one active check-in per person, even under concurrency.
create unique index if not exists checkins_one_active_per_person on checkins(person_id) where undone_at is null;

create table if not exists walkins (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  company text,
  guest_type text not null default 'Unknown',
  reason text not null,
  id_checked boolean not null default false,
  email text,
  replaces_registration uuid references registrations(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  registered_by text not null,
  created_at timestamptz not null default now(),
  decided_by text,
  decided_at timestamptz,
  decision_note text
);

create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('arrival','help')),
  registration_id uuid references registrations(id) on delete cascade,
  walkin_id uuid references walkins(id) on delete cascade,
  reason text,
  raised_by text not null,
  status text not null default 'open' check (status in ('open','acknowledged','handled')),
  created_at timestamptz not null default now(),
  acknowledged_by text,
  acknowledged_at timestamptz,
  handled_by text,
  handled_at timestamptz
);

create table if not exists audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  staff text not null,
  role text not null,
  action text not null,
  target text,
  details jsonb
);

create table if not exists login_attempts (
  id bigint generated always as identity primary key,
  ip text not null,
  at timestamptz not null default now(),
  ok boolean not null
);
create index if not exists login_attempts_ip_at on login_attempts(ip, at);

-- Atomic import replacement (refused if any check-in exists). Called with service role only.
create or replace function replace_guest_list(p_staff text, p_file_name text, p_report jsonb, p_registrations jsonb, p_suggestions jsonb)
returns uuid language plpgsql as $$
declare
  v_import uuid;
  r jsonb;
  v_person uuid;
  v_rows jsonb := '{}'::jsonb; -- row_number -> registration id
  v_reg uuid;
  s jsonb;
begin
  if exists (select 1 from checkins) then
    raise exception 'IMPORT_BLOCKED_CHECKINS_EXIST';
  end if;
  delete from alerts; delete from duplicate_suggestions; delete from registrations; delete from people;
  insert into imports(staff, file_name, report) values (p_staff, p_file_name, p_report) returning id into v_import;
  for r in select * from jsonb_array_elements(p_registrations) loop
    insert into people(status) values (coalesce(r->>'status','registered')) returning id into v_person;
    insert into registrations(person_id, import_id, row_number, reg_id, reg_id_generated, first_name, last_name, company,
      guest_type, breakout, search_text, raw, clean, flags, changes, desk_note, manager_notes, ticket_token)
    values (v_person, v_import, (r->>'row_number')::int, r->>'reg_id', (r->>'reg_id_generated')::boolean, r->>'first_name',
      r->>'last_name', r->>'company', r->>'guest_type', r->>'breakout', r->>'search_text', r->'raw', r->'clean',
      r->'flags', r->'changes', r->>'desk_note', r->>'manager_notes', r->>'ticket_token')
    returning id into v_reg;
    v_rows := v_rows || jsonb_build_object(r->>'row_number', v_reg);
  end loop;
  for s in select * from jsonb_array_elements(p_suggestions) loop
    insert into duplicate_suggestions(registration_a, registration_b, strength, reason)
    values ((v_rows->>(s->>'row_a'))::uuid, (v_rows->>(s->>'row_b'))::uuid, s->>'strength', s->>'reason');
  end loop;
  return v_import;
end $$;

alter table imports enable row level security;
alter table people enable row level security;
alter table registrations enable row level security;
alter table duplicate_suggestions enable row level security;
alter table checkins enable row level security;
alter table walkins enable row level security;
alter table alerts enable row level security;
alter table audit_log enable row level security;
alter table login_attempts enable row level security;

revoke execute on function replace_guest_list(text,text,jsonb,jsonb,jsonb) from public, anon, authenticated;
