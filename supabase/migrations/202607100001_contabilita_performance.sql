-- Indici consigliati per Nova > Contabilità.
-- Eseguire nel SQL Editor di Supabase oppure tramite Supabase CLI.

create index if not exists entries_operation_datetime_idx
  on public.entries (operation_datetime desc);

create index if not exists entries_date_fallback_idx
  on public.entries (date desc)
  where operation_datetime is null;

create index if not exists entries_vat_period_idx
  on public.entries (operation_datetime, date)
  where amount_in > 0 or vat_amount > 0;

create index if not exists entries_method_period_idx
  on public.entries (method, operation_datetime);
