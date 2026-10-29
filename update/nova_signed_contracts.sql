-- Nova gestionale | Archivio riservato contratti firmati insegnanti e volontari
-- Eseguire UNA VOLTA nel SQL Editor del progetto SUPABASE NOVA
-- (VITE_SUPABASE_URL), NON nel progetto Orchidea Allievi.
-- Non modifica alcuna anagrafica né alcun documento precedente.

begin;

create extension if not exists pgcrypto;

create table if not exists public.staff_signed_contracts (
  id uuid primary key default gen_random_uuid(),
  staff_kind text not null check (staff_kind in ('teacher', 'volunteer')),
  staff_source text not null,
  staff_id text not null check (length(staff_id) > 0),
  staff_name text not null default '',
  file_path text not null unique,
  file_name text not null check (length(file_name) between 1 and 255),
  file_mime text not null check (file_mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  file_size bigint not null check (file_size between 1 and 10485760),
  signed_at date,
  uploaded_by uuid not null default auth.uid(),
  uploaded_at timestamptz not null default now(),
  constraint staff_signed_contracts_source_check check (
    (staff_kind = 'teacher' and staff_source in ('insegnanti', 'teachers', 'teachers_nova'))
    or (staff_kind = 'volunteer' and staff_source = 'sport_volunteers')
  ),
  constraint staff_signed_contracts_path_check check (
    file_path like staff_kind || '/' || staff_source || '/%'
  )
);

create index if not exists staff_signed_contracts_lookup
  on public.staff_signed_contracts (staff_kind, staff_source, staff_id, uploaded_at desc);

alter table public.staff_signed_contracts enable row level security;

-- Anche utenti autenticati normali/segretaria possono consultare i documenti
-- per controllo; solo admin attivi possono aggiungerne di nuovi.
-- Il ruolo deriva dalla tabella protetta users, non dai metadati dell'utente.
drop policy if exists "staff_contracts_staff_read" on public.staff_signed_contracts;
create policy "staff_contracts_staff_read"
  on public.staff_signed_contracts for select to authenticated
  using (exists (
    select 1 from public.users u
    where u.id = (select auth.uid())
      and lower(u.role) in ('admin', 'user')
      and u.is_active = true
  ));

drop policy if exists "staff_contracts_admin_insert" on public.staff_signed_contracts;
create policy "staff_contracts_admin_insert"
  on public.staff_signed_contracts for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and exists (
      select 1 from public.users u
      where u.id = (select auth.uid())
        and lower(u.role) = 'admin' and u.is_active = true
    )
  );

revoke all on public.staff_signed_contracts from anon;
grant select, insert on public.staff_signed_contracts to authenticated;

-- Bucket privato: il link pubblico permanente NON viene mai usato.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'nova-signed-contracts', 'nova-signed-contracts', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = 10485760,
      allowed_mime_types = excluded.allowed_mime_types;

-- Policy Storage: upload soltanto admin, download per personale autorizzato.
drop policy if exists "nova_contracts_staff_storage_read" on storage.objects;
create policy "nova_contracts_staff_storage_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'nova-signed-contracts'
    and exists (
      select 1 from public.users u
      where u.id = (select auth.uid())
        and lower(u.role) in ('admin', 'user') and u.is_active = true
    )
  );

drop policy if exists "nova_contracts_admin_storage_insert" on storage.objects;
create policy "nova_contracts_admin_storage_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'nova-signed-contracts'
    and (storage.foldername(name))[1] in ('teacher', 'volunteer')
    and exists (
      select 1 from public.users u
      where u.id = (select auth.uid())
        and lower(u.role) = 'admin' and u.is_active = true
    )
  );

-- L'unica cancellazione prevista dall'app e' il rollback del file in caso
-- di errore nella registrazione dei metadati; il documento archiviato
-- non dispone di pulsante elimina, per preservare lo storico.
drop policy if exists "nova_contracts_admin_storage_delete" on storage.objects;
create policy "nova_contracts_admin_storage_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'nova-signed-contracts'
    and owner_id = (select auth.uid())::text
    and not exists (
      select 1 from public.staff_signed_contracts c
      where c.file_path = name
    )
    and exists (
      select 1 from public.users u
      where u.id = (select auth.uid())
        and lower(u.role) = 'admin' and u.is_active = true
    )
  );

commit;
notify pgrst, 'reload schema';
