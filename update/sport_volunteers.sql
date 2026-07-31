-- Nova: anagrafiche e accordi dei volontari sportivi
create extension if not exists pgcrypto;

create table if not exists public.sport_volunteers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  tax_code text not null unique,
  birth_date date,
  birth_place text,
  birth_province text,
  residence_address text,
  residence_city text,
  residence_province text,
  residence_postal_code text,
  role text not null default 'barman' check (role in ('barman','cameriere','barlady','ballerino','animatore','videomaker','fotografo')),
  additional_roles text[] not null default '{}',
  duties text,
  venue text not null default 'Club Orchidea ASD - Via Giuseppe Ungaretti 34, Saronno (VA)',
  contract_start_date date not null default date '2026-09-07',
  contract_end_date date not null default date '2027-06-30',
  notice_days integer not null default 15 check (notice_days >= 0),
  signing_place text not null default 'Saronno',
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sport_volunteers enable row level security;

drop policy if exists "sport_volunteers_admin_select" on public.sport_volunteers;
drop policy if exists "sport_volunteers_authenticated_select" on public.sport_volunteers;
drop policy if exists "sport_volunteers_admin_insert" on public.sport_volunteers;
drop policy if exists "sport_volunteers_admin_update" on public.sport_volunteers;
drop policy if exists "sport_volunteers_admin_delete" on public.sport_volunteers;

create policy "sport_volunteers_authenticated_select" on public.sport_volunteers for select to authenticated
using (exists (
  select 1 from public.users u
  where u.id = auth.uid()
    and lower(u.role) in ('admin', 'user')
    and u.is_active = true
));
create policy "sport_volunteers_admin_insert" on public.sport_volunteers for insert to authenticated
with check (exists (select 1 from public.users u where u.id = auth.uid() and lower(u.role) = 'admin' and u.is_active = true));
create policy "sport_volunteers_admin_update" on public.sport_volunteers for update to authenticated
using (exists (select 1 from public.users u where u.id = auth.uid() and lower(u.role) = 'admin' and u.is_active = true))
with check (exists (select 1 from public.users u where u.id = auth.uid() and lower(u.role) = 'admin' and u.is_active = true));
create policy "sport_volunteers_admin_delete" on public.sport_volunteers for delete to authenticated
using (exists (select 1 from public.users u where u.id = auth.uid() and lower(u.role) = 'admin' and u.is_active = true));

-- Anagrafiche ricavate dai contratti storici forniti. Email, telefono e CAP restano da completare.
insert into public.sport_volunteers
(full_name, tax_code, birth_date, birth_place, residence_address, residence_city, residence_province, role, additional_roles, duties, contract_start_date, contract_end_date)
values
('Erika Milieri', 'MLRRKE98P61B639I', '1998-09-21', 'Cantù', 'Via Della Resistenza 24', 'Cermenate', 'CO', 'barman', array['cameriere'], 'Barman, aiuto bar e servizio ai tavoli.', '2026-09-07', '2027-06-30'),
('Giuseppe Di Giorgi', 'DGRGPP85C31G273Y', '1985-03-31', 'Palermo', 'Viale Vittorio Veneto 9', 'Gallarate', 'VA', 'barman', array['cameriere'], 'Barman, aiuto bar e servizio ai tavoli.', '2026-09-07', '2027-06-30'),
('Loris Zagaria', 'ZGRLRS99D08E801X', '1999-04-08', 'Magenta', 'Via San Pietro 5', 'Bollate', 'MI', 'barman', array['cameriere'], 'Barman, aiuto bar e servizio ai tavoli.', '2026-09-07', '2027-06-30'),
('Marco Rizzo', 'RZZMRC85M09I441G', '1985-08-09', 'Saronno', 'Via Diaz 147', 'Marnate', 'VA', 'barman', array['cameriere'], 'Barman e servizio ai tavoli.', '2026-09-07', '2027-06-30'),
('Valerio Mario Paolo Coruzzi', 'CRZVRM69B28G772K', '1969-02-28', 'Pogliano Milanese', 'Via Da Giussano A. 4', 'Nerviano', 'MI', 'barman', array['cameriere'], 'Barman, aiuto bar e servizio ai tavoli.', '2026-09-07', '2027-06-30'),
('Vincenzo Pisciotta', 'PSCVCN05T29I441Z', '2005-12-29', 'Saronno', 'Via Leonardo Da Vinci 46', 'Saronno', 'VA', 'barman', array['cameriere'], 'Barman, aiuto bar e servizio ai tavoli.', '2026-09-07', '2027-06-30')
on conflict (tax_code) do update set
  full_name = excluded.full_name,
  birth_date = excluded.birth_date,
  birth_place = excluded.birth_place,
  residence_address = excluded.residence_address,
  residence_city = excluded.residence_city,
  residence_province = excluded.residence_province,
  role = excluded.role,
  additional_roles = excluded.additional_roles,
  duties = excluded.duties,
  updated_at = now();

notify pgrst, 'reload schema';
