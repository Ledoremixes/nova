-- =============================================================
-- NOVA - ESERCIZI FINANZIARI ASD ORCHIDEA
-- Statuto: esercizio solare 1 gennaio - 31 dicembre.
-- Il primo esercizio gestito in Nova parte il 06/06/2025.
-- =============================================================

begin;

create table if not exists public.financial_years (
  id uuid primary key default gen_random_uuid(),
  year integer not null unique check (year >= 2025 and year <= 2200),
  starts_on date not null,
  ends_on date not null,
  status text not null default 'open' check (status in ('open', 'closed')),

  opening_cash_balance numeric(14,2) not null default 0,
  opening_bank_balance numeric(14,2) not null default 0,
  opening_receivables numeric(14,2) not null default 0,
  opening_payables numeric(14,2) not null default 0,
  current_receivables numeric(14,2) not null default 0,
  current_payables numeric(14,2) not null default 0,

  closing_cash_balance numeric(14,2),
  closing_bank_balance numeric(14,2),
  closing_receivables numeric(14,2),
  closing_payables numeric(14,2),
  total_income numeric(14,2) not null default 0,
  total_expenses numeric(14,2) not null default 0,
  result numeric(14,2) not null default 0,

  closing_note text,
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint financial_years_dates_valid check (ends_on >= starts_on)
);

create table if not exists public.financial_year_events (
  id uuid primary key default gen_random_uuid(),
  financial_year_id uuid not null references public.financial_years(id) on delete cascade,
  event_type text not null check (event_type in ('closed', 'reopened', 'position_updated')),
  actor_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists financial_years_status_idx
  on public.financial_years (status, year desc);

create index if not exists financial_year_events_year_idx
  on public.financial_year_events (financial_year_id, created_at desc);

create or replace function public.set_financial_year_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_financial_years_updated_at on public.financial_years;
create trigger trg_financial_years_updated_at
before update on public.financial_years
for each row execute function public.set_financial_year_updated_at();

create or replace function public.is_nova_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where (
      u.id = auth.uid()
      or lower(coalesce(u.email::text, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
      and lower(coalesce(u.role::text, '')) = 'admin'
      and coalesce(u.is_active, true) = true
  );
$$;

revoke all on function public.is_nova_admin() from public;
grant execute on function public.is_nova_admin() to authenticated;

alter table public.financial_years enable row level security;
alter table public.financial_year_events enable row level security;

grant select, insert, update on table public.financial_years to authenticated;
grant select, insert on table public.financial_year_events to authenticated;

drop policy if exists "financial_years_authenticated_read" on public.financial_years;
create policy "financial_years_authenticated_read"
on public.financial_years
for select
to authenticated
using (true);

drop policy if exists "financial_years_admin_insert" on public.financial_years;
create policy "financial_years_admin_insert"
on public.financial_years
for insert
to authenticated
with check (public.is_nova_admin());

drop policy if exists "financial_years_admin_update" on public.financial_years;
create policy "financial_years_admin_update"
on public.financial_years
for update
to authenticated
using (public.is_nova_admin())
with check (public.is_nova_admin());

drop policy if exists "financial_year_events_authenticated_read" on public.financial_year_events;
create policy "financial_year_events_authenticated_read"
on public.financial_year_events
for select
to authenticated
using (true);

drop policy if exists "financial_year_events_admin_insert" on public.financial_year_events;
create policy "financial_year_events_admin_insert"
on public.financial_year_events
for insert
to authenticated
with check (public.is_nova_admin());

insert into public.financial_years (year, starts_on, ends_on)
values
  (2025, date '2025-06-06', date '2025-12-31'),
  (2026, date '2026-01-01', date '2026-12-31')
on conflict (year) do nothing;

create or replace function public.save_financial_year_position(
  p_year integer,
  p_opening_cash_balance numeric,
  p_opening_bank_balance numeric,
  p_opening_receivables numeric,
  p_opening_payables numeric,
  p_current_receivables numeric,
  p_current_payables numeric
)
returns setof public.financial_years
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year public.financial_years%rowtype;
begin
  if not public.is_nova_admin() then
    raise exception 'NOVA_ADMIN_REQUIRED';
  end if;

  insert into public.financial_years (year, starts_on, ends_on)
  values (
    p_year,
    case when p_year = 2025 then date '2025-06-06' else make_date(p_year, 1, 1) end,
    make_date(p_year, 12, 31)
  )
  on conflict (year) do nothing;

  select * into v_year
  from public.financial_years
  where year = p_year
  for update;

  if v_year.status = 'closed' then
    raise exception 'FINANCIAL_YEAR_ALREADY_CLOSED';
  end if;

  update public.financial_years
  set
    opening_cash_balance = coalesce(p_opening_cash_balance, 0),
    opening_bank_balance = coalesce(p_opening_bank_balance, 0),
    opening_receivables = coalesce(p_opening_receivables, 0),
    opening_payables = coalesce(p_opening_payables, 0),
    current_receivables = coalesce(p_current_receivables, 0),
    current_payables = coalesce(p_current_payables, 0)
  where year = p_year
  returning * into v_year;

  insert into public.financial_year_events (
    financial_year_id,
    event_type,
    actor_id,
    details
  ) values (
    v_year.id,
    'position_updated',
    auth.uid(),
    jsonb_build_object(
      'year', p_year,
      'opening_cash_balance', coalesce(p_opening_cash_balance, 0),
      'opening_bank_balance', coalesce(p_opening_bank_balance, 0),
      'opening_receivables', coalesce(p_opening_receivables, 0),
      'opening_payables', coalesce(p_opening_payables, 0),
      'current_receivables', coalesce(p_current_receivables, 0),
      'current_payables', coalesce(p_current_payables, 0)
    )
  );

  return next v_year;
end;
$$;

create or replace function public.close_financial_year(
  p_year integer,
  p_closing_cash_balance numeric,
  p_closing_bank_balance numeric,
  p_closing_receivables numeric,
  p_closing_payables numeric,
  p_note text default null
)
returns setof public.financial_years
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year public.financial_years%rowtype;
  v_total_income numeric(14,2) := 0;
  v_total_expenses numeric(14,2) := 0;
  v_next_year integer;
begin
  if not public.is_nova_admin() then
    raise exception 'NOVA_ADMIN_REQUIRED';
  end if;

  insert into public.financial_years (year, starts_on, ends_on)
  values (
    p_year,
    case when p_year = 2025 then date '2025-06-06' else make_date(p_year, 1, 1) end,
    make_date(p_year, 12, 31)
  )
  on conflict (year) do nothing;

  select * into v_year
  from public.financial_years
  where year = p_year
  for update;

  if v_year.status = 'closed' then
    raise exception 'FINANCIAL_YEAR_ALREADY_CLOSED';
  end if;

  if current_date < v_year.ends_on then
    raise exception 'FINANCIAL_YEAR_NOT_ENDED';
  end if;

  select
    coalesce(sum(coalesce(e.amount_in, 0)), 0),
    coalesce(sum(coalesce(e.amount_out, 0)), 0)
  into v_total_income, v_total_expenses
  from public.entries e
  where coalesce(e.operation_datetime::date, e.date::date)
        between v_year.starts_on and v_year.ends_on;

  update public.financial_years
  set
    status = 'closed',
    closing_cash_balance = coalesce(p_closing_cash_balance, 0),
    closing_bank_balance = coalesce(p_closing_bank_balance, 0),
    closing_receivables = coalesce(p_closing_receivables, 0),
    closing_payables = coalesce(p_closing_payables, 0),
    current_receivables = coalesce(p_closing_receivables, 0),
    current_payables = coalesce(p_closing_payables, 0),
    total_income = v_total_income,
    total_expenses = v_total_expenses,
    result = v_total_income - v_total_expenses,
    closing_note = nullif(trim(coalesce(p_note, '')), ''),
    closed_at = now(),
    closed_by = auth.uid()
  where year = p_year
  returning * into v_year;

  v_next_year := p_year + 1;

  insert into public.financial_years (
    year,
    starts_on,
    ends_on,
    opening_cash_balance,
    opening_bank_balance,
    opening_receivables,
    opening_payables,
    current_receivables,
    current_payables
  ) values (
    v_next_year,
    make_date(v_next_year, 1, 1),
    make_date(v_next_year, 12, 31),
    coalesce(p_closing_cash_balance, 0),
    coalesce(p_closing_bank_balance, 0),
    coalesce(p_closing_receivables, 0),
    coalesce(p_closing_payables, 0),
    coalesce(p_closing_receivables, 0),
    coalesce(p_closing_payables, 0)
  )
  on conflict (year) do update
  set
    opening_cash_balance = excluded.opening_cash_balance,
    opening_bank_balance = excluded.opening_bank_balance,
    opening_receivables = excluded.opening_receivables,
    opening_payables = excluded.opening_payables,
    current_receivables = case
      when exists (
        select 1
        from public.financial_year_events fye
        where fye.financial_year_id = public.financial_years.id
          and fye.event_type = 'position_updated'
      ) then public.financial_years.current_receivables
      else excluded.current_receivables
    end,
    current_payables = case
      when exists (
        select 1
        from public.financial_year_events fye
        where fye.financial_year_id = public.financial_years.id
          and fye.event_type = 'position_updated'
      ) then public.financial_years.current_payables
      else excluded.current_payables
    end
  where public.financial_years.status = 'open';

  insert into public.financial_year_events (
    financial_year_id,
    event_type,
    actor_id,
    details
  ) values (
    v_year.id,
    'closed',
    auth.uid(),
    jsonb_build_object(
      'year', p_year,
      'total_income', v_total_income,
      'total_expenses', v_total_expenses,
      'result', v_total_income - v_total_expenses,
      'closing_cash_balance', coalesce(p_closing_cash_balance, 0),
      'closing_bank_balance', coalesce(p_closing_bank_balance, 0),
      'closing_receivables', coalesce(p_closing_receivables, 0),
      'closing_payables', coalesce(p_closing_payables, 0)
    )
  );

  return next v_year;
end;
$$;

create or replace function public.reopen_financial_year(p_year integer)
returns setof public.financial_years
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year public.financial_years%rowtype;
begin
  if not public.is_nova_admin() then
    raise exception 'NOVA_ADMIN_REQUIRED';
  end if;

  select * into v_year
  from public.financial_years
  where year = p_year
  for update;

  if v_year.id is null or v_year.status <> 'closed' then
    raise exception 'FINANCIAL_YEAR_NOT_CLOSED';
  end if;

  update public.financial_years
  set status = 'open'
  where year = p_year
  returning * into v_year;

  insert into public.financial_year_events (
    financial_year_id,
    event_type,
    actor_id,
    details
  ) values (
    v_year.id,
    'reopened',
    auth.uid(),
    jsonb_build_object('year', p_year)
  );

  return next v_year;
end;
$$;

revoke all on function public.close_financial_year(integer, numeric, numeric, numeric, numeric, text) from public;
revoke all on function public.reopen_financial_year(integer) from public;
revoke all on function public.save_financial_year_position(integer, numeric, numeric, numeric, numeric, numeric, numeric) from public;
grant execute on function public.close_financial_year(integer, numeric, numeric, numeric, numeric, text) to authenticated;
grant execute on function public.reopen_financial_year(integer) to authenticated;
grant execute on function public.save_financial_year_position(integer, numeric, numeric, numeric, numeric, numeric, numeric) to authenticated;

create or replace function public.prevent_closed_financial_year_entry_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_date date;
  v_new_date date;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old_date := coalesce(old.operation_datetime::date, old.date::date);
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    v_new_date := coalesce(new.operation_datetime::date, new.date::date);
  end if;

  if exists (
    select 1
    from public.financial_years fy
    where fy.status = 'closed'
      and (
        (v_old_date is not null and v_old_date between fy.starts_on and fy.ends_on)
        or (v_new_date is not null and v_new_date between fy.starts_on and fy.ends_on)
      )
  ) then
    raise exception 'FINANCIAL_YEAR_CLOSED';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_entries_prevent_closed_financial_year on public.entries;
create trigger trg_entries_prevent_closed_financial_year
before insert or update or delete on public.entries
for each row execute function public.prevent_closed_financial_year_entry_changes();

commit;
