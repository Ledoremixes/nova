-- Nova - Catalogo pacchetti e copertura pagamenti per competenza
-- Eseguire nel database Supabase di Orchidea Allievi.

create extension if not exists pgcrypto;

create table if not exists public.nova_packages_catalog (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null default 'mensile',
  durata_mesi integer not null default 1 check (durata_mesi between 1 and 24),
  prezzo numeric(10,2) not null default 0 check (prezzo >= 0),
  descrizione text,
  attivo boolean not null default true,
  ordine integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- Se la tabella esisteva già da una versione precedente, CREATE TABLE IF NOT EXISTS
-- non aggiorna il default della colonna id. Forziamo quindi il default in modo idempotente.
do $$
declare
  id_type text;
begin
  select data_type into id_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'nova_packages_catalog'
    and column_name = 'id';

  if id_type = 'uuid' then
    execute 'alter table public.nova_packages_catalog alter column id set default gen_random_uuid()';
  elsif id_type in ('text', 'character varying', 'character') then
    execute 'alter table public.nova_packages_catalog alter column id set default gen_random_uuid()::text';
  end if;
end $$;

create index if not exists nova_packages_catalog_attivo_idx
  on public.nova_packages_catalog(attivo, ordine, nome);

alter table public.nova_packages_catalog enable row level security;

drop policy if exists "nova_packages_catalog_read" on public.nova_packages_catalog;

drop policy if exists "nova_packages_catalog_insert" on public.nova_packages_catalog;
drop policy if exists "nova_packages_catalog_update" on public.nova_packages_catalog;
drop policy if exists "nova_packages_catalog_delete" on public.nova_packages_catalog;

-- Le scritture passano esclusivamente dalle API server di Nova con service role.
-- Il catalogo viene letto e scritto dalle API server di Nova; nessuna policy client espone direttamente la tabella.

-- Snapshot del pacchetto sul pagamento: le modifiche future al catalogo non cambiano lo storico.
alter table public.pagamenti add column if not exists nova_package_id uuid;
alter table public.pagamenti add column if not exists nova_package_name text;
alter table public.pagamenti add column if not exists nova_package_type text;
alter table public.pagamenti add column if not exists nova_package_total numeric(10,2);
alter table public.pagamenti add column if not exists nova_package_duration_months integer;
alter table public.pagamenti add column if not exists nova_payment_group_id uuid;
alter table public.pagamenti add column if not exists nova_coverage_from date;
alter table public.pagamenti add column if not exists nova_coverage_to date;
alter table public.pagamenti add column if not exists nova_coverage_complete boolean not null default false;
alter table public.pagamenti add column if not exists nova_cash_amount numeric(10,2) not null default 0;

create index if not exists pagamenti_nova_payment_group_idx
  on public.pagamenti(nova_payment_group_id);
create index if not exists pagamenti_nova_package_idx
  on public.pagamenti(nova_package_id);

notify pgrst, 'reload schema';
