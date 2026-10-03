-- Przywraca prawo wywołania funkcji app_* dla klienta (klucz publishable = rola anon).
-- Migracja zdaza_schemat (gałąź claude/keen-ritchie-thqfn4) zrobiła
-- `revoke all on all functions in schema public from public, anon, authenticated`,
-- co odcięło też te funkcje i położyło produkcję (500 na każdej stronie).
-- Nie używaj zbiorczych revoke na całym schemacie public — tylko na swoich funkcjach.
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'app\_%'
  loop
    execute format('grant execute on function %s to anon, authenticated, service_role', f);
  end loop;
end
$$;
