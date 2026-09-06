-- Nova - FIX catalogo pacchetti: generazione automatica ID
-- Eseguire nel database Supabase di Orchidea Allievi.
-- Sicuro da eseguire anche se la tabella è già popolata.

create extension if not exists pgcrypto;

do $$
declare
  id_type text;
begin
  select data_type
    into id_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'nova_packages_catalog'
    and column_name = 'id';

  if id_type is null then
    raise exception 'La colonna public.nova_packages_catalog.id non esiste';
  elsif id_type = 'uuid' then
    execute 'alter table public.nova_packages_catalog alter column id set default gen_random_uuid()';
  elsif id_type in ('text', 'character varying', 'character') then
    execute 'alter table public.nova_packages_catalog alter column id set default gen_random_uuid()::text';
  else
    raise exception 'Tipo colonna id non supportato: %', id_type;
  end if;
end $$;

notify pgrst, 'reload schema';
