-- NOVA - Percentuale compenso insegnante specifica per singolo corso
-- Eseguire UNA SOLA VOLTA sul database Supabase usato da Nova / Orchidea Allievi.

begin;

alter table public.insegnanti_corsi
  add column if not exists percentuale_compenso numeric(5,2);

alter table public.insegnanti_corsi
  drop constraint if exists insegnanti_corsi_percentuale_compenso_check;

alter table public.insegnanti_corsi
  add constraint insegnanti_corsi_percentuale_compenso_check
  check (
    percentuale_compenso is null
    or (percentuale_compenso >= 0 and percentuale_compenso <= 100)
  );

comment on column public.insegnanti_corsi.percentuale_compenso is
  'Percentuale compenso specifica per questo insegnante su questo corso. NULL = usa la percentuale generale della scheda insegnante.';

commit;
