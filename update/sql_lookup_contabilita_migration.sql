-- =========================================
-- MIGRAZIONE CONTABILITA BASATA SU lookup_options
-- =========================================

begin;

alter table public.lookup_options
  add column if not exists report_area text,
  add column if not exists report_bucket text,
  add column if not exists report_row_code text,
  add column if not exists report_row_label text;

create index if not exists idx_lookup_options_contabilita
  on public.lookup_options(section_key, list_key, value);

-- Copia iniziale dei conti legacy da accounts verso lookup_options
insert into public.lookup_options (
  user_id,
  section_key,
  list_key,
  label,
  value,
  sort_order,
  is_active,
  report_area,
  report_bucket,
  report_row_code,
  report_row_label
)
select
  a.user_id,
  'contabilita' as section_key,
  'conti_rendiconto' as list_key,
  a.name as label,
  a.code as value,
  row_number() over (partition by a.user_id order by a.code) as sort_order,
  true as is_active,

  case
    when a.type = 'entrata' and upper(coalesce(a.code, '')) = 'C' then 'commerciale'
    when a.type = 'uscita' and upper(coalesce(a.code, '')) in ('CB1', 'CB2') then 'commerciale'
    when a.type = 'uscita' and upper(coalesce(a.code, '')) in ('IVD', 'SI') then 'finanziaria'
    when a.type = 'uscita' and upper(coalesce(a.code, '')) in ('AFF', 'S', 'AF', 'M', 'R', 'TAS', 'E', 'AB') then 'istituzionale'
    when a.type = 'entrata' and upper(coalesce(a.code, '')) in ('IST', 'AS', 'I', 'SCU') then 'istituzionale'
    when a.cashflow_group ilike '%bar%' then 'commerciale'
    when a.cashflow_group ilike '%attivita commercial%' then 'commerciale'
    when a.cashflow_group ilike '%imposte%' then 'finanziaria'
    when a.type = 'entrata' then 'istituzionale'
    when a.type = 'uscita' then 'istituzionale'
    else 'da_classificare'
  end as report_area,

  case
    when a.type = 'entrata' and upper(coalesce(a.code, '')) = 'C' then 'C_ENTRATE_COMMERCIALI'
    when a.type = 'uscita' and upper(coalesce(a.code, '')) in ('CB1', 'CB2') then 'C_USCITE_COMMERCIALI'
    when a.type = 'uscita' and upper(coalesce(a.code, '')) in ('IVD', 'SI') then 'D_USCITE_FINANZIARIE'
    when a.type = 'entrata' and upper(coalesce(a.code, '')) in ('IST', 'AS', 'I', 'SCU') then 'A_ENTRATE_ISTITUZIONALI'
    when a.type = 'uscita' and upper(coalesce(a.code, '')) in ('AFF', 'S', 'AF', 'M', 'R', 'TAS', 'E', 'AB') then 'A_USCITE_ISTITUZIONALI'
    when a.type = 'entrata' then 'A_ENTRATE_ISTITUZIONALI'
    when a.type = 'uscita' then 'A_USCITE_ISTITUZIONALI'
    else 'Z_DA_CLASSIFICARE'
  end as report_bucket,

  case
    when upper(coalesce(a.code, '')) = 'IST' then 'RA1'
    when upper(coalesce(a.code, '')) = 'AS' then 'RA1'
    when upper(coalesce(a.code, '')) = 'I' then 'RA13'
    when upper(coalesce(a.code, '')) = 'SCU' then 'RA7'
    when upper(coalesce(a.code, '')) = 'AFF' then 'CA4'
    when upper(coalesce(a.code, '')) = 'S' then 'CA2'
    when upper(coalesce(a.code, '')) = 'AF' then 'CA3'
    when upper(coalesce(a.code, '')) = 'M' then 'CA5'
    when upper(coalesce(a.code, '')) = 'R' then 'CA7'
    when upper(coalesce(a.code, '')) = 'TAS' then 'CA7'
    when upper(coalesce(a.code, '')) = 'E' then 'CA2'
    when upper(coalesce(a.code, '')) = 'AB' then 'CA1'
    when upper(coalesce(a.code, '')) = 'C' then 'RC3'
    when upper(coalesce(a.code, '')) = 'CB1' then 'CC2'
    when upper(coalesce(a.code, '')) = 'CB2' then 'CC2'
    when upper(coalesce(a.code, '')) = 'IVD' then 'RD5'
    when upper(coalesce(a.code, '')) = 'SI' then 'RD5'
    else null
  end as report_row_code,

  case
    when upper(coalesce(a.code, '')) in ('IST', 'AS') then 'Entrate da quote associative'
    when upper(coalesce(a.code, '')) = 'I' then 'Altre entrate istituzionali'
    when upper(coalesce(a.code, '')) = 'SCU' then 'Contributi da soggetti privati'
    when upper(coalesce(a.code, '')) = 'AFF' then 'Godimento beni di terzi'
    when upper(coalesce(a.code, '')) = 'S' then 'Servizi'
    when upper(coalesce(a.code, '')) = 'AF' then 'Affiliazioni e tesseramenti'
    when upper(coalesce(a.code, '')) = 'M' then 'Personale'
    when upper(coalesce(a.code, '')) in ('R', 'TAS') then 'Altre uscite istituzionali'
    when upper(coalesce(a.code, '')) = 'E' then 'Servizi'
    when upper(coalesce(a.code, '')) = 'AB' then 'Materie prime, sussidiarie, di consumo e merci'
    when upper(coalesce(a.code, '')) = 'C' then 'Altre entrate'
    when upper(coalesce(a.code, '')) in ('CB1', 'CB2') then 'Uscite per raccolte pubbliche di fondi occasionali'
    when upper(coalesce(a.code, '')) in ('IVD', 'SI') then 'Altre uscite'
    else a.name
  end as report_row_label
from public.accounts a
where not exists (
  select 1
  from public.lookup_options l
  where l.user_id = a.user_id
    and l.section_key = 'contabilita'
    and l.list_key = 'conti_rendiconto'
    and l.value = a.code
);

commit;

-- Dopo l'esecuzione:
-- 1) vai nella pagina Conti > Contabilità
-- 2) verifica e rifinisci la classificazione di ogni conto
-- 3) il rendiconto userà la classificazione di questi conti, non più il campo nature
