-- Nova - Pacchetti e copertura pagamenti per competenza
-- Versione definitiva 06/09/2026
--
-- Il catalogo pacchetti NON usa più una tabella dedicata: viene salvato nelle
-- lookup_options globali di Nova (section_key='pagamenti', list_key='pacchetti_corsi').
-- Questo elimina la dipendenza dall'API /api/packages-catalog e dal service role
-- del database Orchidea per creare/modificare il listino.
--
-- Questa migrazione va eseguita nel database Supabase di Orchidea Allievi solo
-- per aggiungere ai pagamenti i metadati di pacchetto/copertura.

create extension if not exists pgcrypto;

-- Snapshot del pacchetto sul pagamento: le modifiche future al listino non
-- cambiano lo storico. Il gettone usa nova_coverage_complete=false.
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
