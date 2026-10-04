-- Namiastka środowiska Supabase dla lokalnego Postgresa (tylko do testów).
-- Odtwarza to, czego używa schemat: role, schemat auth z tabelą users,
-- funkcję auth.uid() czytającą claims JWT oraz schemat extensions z pgcrypto.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

create schema if not exists extensions;
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  is_anonymous boolean not null default false,  -- jak w Supabase: true tylko dla signInAnonymously
  created_at timestamptz not null default now()
);

-- Tak samo jak w Supabase: sub z request.jwt.claims.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ), '')::uuid
$$;
