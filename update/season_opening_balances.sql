-- =========================================
-- CAPITALE INIZIALE / UTILE RIPORTATO STAGIONE
-- Gestionale Nova - anno di competenza settembre/agosto
-- =========================================

begin;

create table if not exists public.season_opening_balances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete cascade,
  academic_year text not null,
  from_date date not null,
  to_date date not null,
  opening_balance numeric not null default 0,
  opening_cash_balance numeric not null default 0,
  opening_bank_balance numeric not null default 0,
  note text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_season_opening_balances_academic_year
  on public.season_opening_balances(academic_year);

create index if not exists idx_season_opening_balances_user_year
  on public.season_opening_balances(user_id, academic_year);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_season_opening_balances_updated_at on public.season_opening_balances;

create trigger trg_season_opening_balances_updated_at
before update on public.season_opening_balances
for each row
execute function public.set_updated_at();

commit;

-- Esempio inserimento capitale iniziale stagione 2026/2027:
-- insert into public.season_opening_balances (
--   academic_year,
--   from_date,
--   to_date,
--   opening_balance,
--   opening_cash_balance,
--   opening_bank_balance,
--   note
-- ) values (
--   '2026/2027',
--   '2026-09-01',
--   '2027-08-31',
--   6436.48,
--   0,
--   6436.48,
--   'Utile riportato dalla stagione 2025/2026'
-- );
