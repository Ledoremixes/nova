-- Nova - archivio dati per la generazione dei modelli C1 SIAE
-- Eseguire nel SQL Editor del progetto Supabase usato da Nova.

create extension if not exists pgcrypto;

create table if not exists public.siae_c1_events (
  id uuid primary key default gen_random_uuid(),
  event_date date not null,
  event_time time not null default time '22:30',
  event_kind text not null default 'caraibica' check (event_kind in ('caraibica','country','kizomba','custom')),
  event_title text not null,
  admissions integer not null check (admissions > 0),
  unit_price numeric(10,2) not null default 10 check (unit_price >= 0),
  gross_amount numeric(12,2) not null,
  taxable_amount numeric(12,2) not null,
  entertainment_tax numeric(12,2) not null,
  vat_amount numeric(12,2) not null,
  vat_rate numeric(5,2) not null default 22,
  entertainment_rate numeric(5,2) not null default 16,
  organizer_name text not null default 'CLUB ORCHIDEA ASD',
  organizer_tax_code text not null default '14275140961',
  system_holder text not null default 'MANUEL LEDONNE',
  venue_name text not null default 'CLUB ORCHIDEA ASD',
  municipality text not null default 'SARONNO',
  province text not null default 'VA',
  event_type_code text not null default 'BALLO SM SM61',
  siae_office text not null default 'CESANO MADERNO',
  sector_code text not null default 'UN',
  ticket_type_code text not null default 'I',
  local_code text,
  capacity integer check (capacity is null or capacity >= 0),
  cancelled_tickets integer not null default 0 check (cancelled_tickets >= 0),
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_date, event_time, event_title)
);

create index if not exists siae_c1_events_date_idx on public.siae_c1_events (event_date desc);
create index if not exists siae_c1_events_month_idx on public.siae_c1_events ((date_trunc('month', event_date::timestamp)));

alter table public.siae_c1_events enable row level security;

drop policy if exists "siae_c1_active_users_select" on public.siae_c1_events;
drop policy if exists "siae_c1_active_users_insert" on public.siae_c1_events;
drop policy if exists "siae_c1_active_users_update" on public.siae_c1_events;
drop policy if exists "siae_c1_active_users_delete" on public.siae_c1_events;

-- La sezione deve essere operativa sia per admin sia per utenti normali attivi.
create policy "siae_c1_active_users_select" on public.siae_c1_events
for select to authenticated
using (
  exists (
    select 1 from public.users u
    where (u.id = auth.uid() or lower(u.email) = lower(auth.jwt() ->> 'email'))
      and lower(u.role) in ('admin','user')
      and u.is_active = true
  )
);

create policy "siae_c1_active_users_insert" on public.siae_c1_events
for insert to authenticated
with check (
  exists (
    select 1 from public.users u
    where (u.id = auth.uid() or lower(u.email) = lower(auth.jwt() ->> 'email'))
      and lower(u.role) in ('admin','user')
      and u.is_active = true
  )
);

create policy "siae_c1_active_users_update" on public.siae_c1_events
for update to authenticated
using (
  exists (
    select 1 from public.users u
    where (u.id = auth.uid() or lower(u.email) = lower(auth.jwt() ->> 'email'))
      and lower(u.role) in ('admin','user')
      and u.is_active = true
  )
)
with check (
  exists (
    select 1 from public.users u
    where (u.id = auth.uid() or lower(u.email) = lower(auth.jwt() ->> 'email'))
      and lower(u.role) in ('admin','user')
      and u.is_active = true
  )
);

create policy "siae_c1_active_users_delete" on public.siae_c1_events
for delete to authenticated
using (
  exists (
    select 1 from public.users u
    where (u.id = auth.uid() or lower(u.email) = lower(auth.jwt() ->> 'email'))
      and lower(u.role) in ('admin','user')
      and u.is_active = true
  )
);

-- Storico ricavato dai modelli C1 forniti: ottobre/novembre 2025 e giugno/luglio 2026.
insert into public.siae_c1_events
(event_date,event_time,event_kind,event_title,admissions,unit_price,gross_amount,taxable_amount,entertainment_tax,vat_amount)
values
('2025-10-05','15:00','kizomba','POMERIGGIO SOCIAL KIZOMBA',74,10,740.00,536.23,85.80,117.97),
('2025-11-01','22:30','caraibica','SERATA CARAIBICA - BACHATA E SALSA',156,12,1872.00,1356.52,217.04,298.43),
('2025-11-02','15:00','kizomba','POMERIGGIO SOCIAL KIZOMBA',81,10,810.00,586.96,93.91,129.13),
('2025-11-07','21:00','country','SERATA COUNTRY',87,10,870.00,630.43,100.87,138.70),
('2025-11-08','22:30','caraibica','SERATA CARAIBICA - BACHATA E SALSA',179,10,1790.00,1297.10,207.54,285.36),
('2025-11-14','21:00','country','SERATA COUNTRY',95,10,950.00,688.41,110.14,151.45),
('2025-11-15','22:30','caraibica','SERATA CARAIBICA - BACHATA E SALSA',176,10,1760.00,1275.36,204.06,280.58),
('2025-11-21','21:00','country','SERATA COUNTRY',72,10,720.00,521.74,83.48,114.78),
('2025-11-22','22:30','caraibica','SERATA CARAIBICA - BACHATA E SALSA',183,10,1830.00,1326.09,212.17,291.74),
('2025-11-28','21:00','country','SERATA COUNTRY',88,10,880.00,637.68,102.03,140.29),
('2025-11-29','22:30','caraibica','SERATA CARAIBICA - BACHATA E SALSA',189,10,1890.00,1369.57,219.13,301.30),
('2026-06-05','21:00','country','SERATA COUNTRY',41,10,410.00,297.10,47.54,65.36),
('2026-06-06','22:30','caraibica','SERATA CARAIBICA - BACHATA E SALSA',92,10,920.00,666.67,106.67,146.67),
('2026-06-27','22:30','caraibica','SERATA CARAIBICA - BACHATA E SALSA',52,10,520.00,376.81,60.29,82.90),
('2026-07-04','22:30','caraibica','SERATA CARAIBICA - BACHATA E SALSA',43,10,430.00,311.59,49.86,68.55)
on conflict (event_date, event_time, event_title) do update set
  event_time = excluded.event_time,
  event_kind = excluded.event_kind,
  admissions = excluded.admissions,
  unit_price = excluded.unit_price,
  gross_amount = excluded.gross_amount,
  taxable_amount = excluded.taxable_amount,
  entertainment_tax = excluded.entertainment_tax,
  vat_amount = excluded.vat_amount,
  updated_at = now();

notify pgrst, 'reload schema';
