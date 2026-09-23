-- NOVA - Ripristino pacchetti standard 2026/2027
-- Eseguire nel SQL Editor del database Supabase usato da NOVA,
-- cioe' quello che contiene public.lookup_options.
--
-- SCOPO
-- 1. Riclassifica come AUTOMATICI i pacchetti standard eventualmente modificati a mano.
-- 2. Rimuove tutte le associazioni course_ids dai pacchetti standard.
-- 3. Mantiene prezzo, descrizione, stato attivo e ordine gia' presenti.
-- 4. NON tocca i pacchetti personalizzati: potranno continuare ad avere course_ids.
--
-- Il riconoscimento avviene tramite nome ufficiale oppure pricing_key gia' presente.

begin;

-- 0) Anteprima: queste sono le righe standard che verranno sistemate.
with standard_packages(label, pricing_key, pricing_group, pricing_period, tipo, durata_mesi) as (
  values
    ('A gettone',                         'token',                      'token',          'gettone',      'gettone',      1),
    ('Mensile · 1 corso',                 'single.mensile',             'single',         'mensile',      'mensile',      1),
    ('Trimestrale · 1 corso',             'single.trimestrale',         'single',         'trimestrale',  'trimestrale',  3),
    ('Annuale · 1 corso',                 'single.annuale',             'single',         'annuale',      'annuale',     12),
    ('Mensile · Country',                 'country.mensile',            'country',        'mensile',      'mensile',      1),
    ('Trimestrale · Country',             'country.trimestrale',        'country',        'trimestrale',  'trimestrale',  3),
    ('Annuale · Country',                 'country.annuale',            'country',        'annuale',      'annuale',     12),
    ('Mensile · 2 corsi Bachata + Salsa', 'bachata_salsa.mensile',      'bachata_salsa',  'mensile',      'mensile',      1),
    ('Trimestrale · 2 corsi Bachata + Salsa','bachata_salsa.trimestrale','bachata_salsa','trimestrale',  'trimestrale',  3),
    ('Annuale · 2 corsi Bachata + Salsa', 'bachata_salsa.annuale',      'bachata_salsa',  'annuale',      'annuale',     12),
    ('Mensile · 2 corsi Special',         'two_special.mensile',        'two_special',    'mensile',      'mensile',      1),
    ('Trimestrale · 2 corsi Special',     'two_special.trimestrale',    'two_special',    'trimestrale',  'trimestrale',  3),
    ('Annuale · 2 corsi Special',         'two_special.annuale',        'two_special',    'annuale',      'annuale',     12),
    ('Mensile · 3 corsi',                 'three.mensile',              'three',          'mensile',      'mensile',      1),
    ('Trimestrale · 3 corsi',             'three.trimestrale',          'three',          'trimestrale',  'trimestrale',  3),
    ('Annuale · 3 corsi',                 'three.annuale',              'three',          'annuale',      'annuale',     12),
    ('Mensile · All You Can Dance',       'unlimited.mensile',          'unlimited',      'mensile',      'mensile',      1),
    ('Trimestrale · All You Can Dance',   'unlimited.trimestrale',      'unlimited',      'trimestrale',  'trimestrale',  3),
    ('Annuale · All You Can Dance',       'unlimited.annuale',          'unlimited',      'annuale',      'annuale',     12)
), candidates as (
  select
    lo.id,
    lo.label,
    lo.value,
    sp.pricing_key,
    sp.pricing_group,
    sp.pricing_period,
    sp.tipo,
    sp.durata_mesi
  from public.lookup_options lo
  join standard_packages sp
    on lower(trim(lo.label)) = lower(trim(sp.label))
    or (
      lo.value is not null
      and trim(lo.value) like '{%'
      and coalesce((lo.value::jsonb ->> 'pricing_key'), '') = sp.pricing_key
    )
  where lo.section_key = 'pagamenti'
    and lo.list_key = 'pacchetti_corsi'
)
select id, label, pricing_key, value
from candidates
order by label;

-- 1) Ripristino metadata automatici e rimozione delle associazioni ai corsi.
with standard_packages(label, pricing_key, pricing_group, pricing_period, tipo, durata_mesi) as (
  values
    ('A gettone',                         'token',                      'token',          'gettone',      'gettone',      1),
    ('Mensile · 1 corso',                 'single.mensile',             'single',         'mensile',      'mensile',      1),
    ('Trimestrale · 1 corso',             'single.trimestrale',         'single',         'trimestrale',  'trimestrale',  3),
    ('Annuale · 1 corso',                 'single.annuale',             'single',         'annuale',      'annuale',     12),
    ('Mensile · Country',                 'country.mensile',            'country',        'mensile',      'mensile',      1),
    ('Trimestrale · Country',             'country.trimestrale',        'country',        'trimestrale',  'trimestrale',  3),
    ('Annuale · Country',                 'country.annuale',            'country',        'annuale',      'annuale',     12),
    ('Mensile · 2 corsi Bachata + Salsa', 'bachata_salsa.mensile',      'bachata_salsa',  'mensile',      'mensile',      1),
    ('Trimestrale · 2 corsi Bachata + Salsa','bachata_salsa.trimestrale','bachata_salsa','trimestrale',  'trimestrale',  3),
    ('Annuale · 2 corsi Bachata + Salsa', 'bachata_salsa.annuale',      'bachata_salsa',  'annuale',      'annuale',     12),
    ('Mensile · 2 corsi Special',         'two_special.mensile',        'two_special',    'mensile',      'mensile',      1),
    ('Trimestrale · 2 corsi Special',     'two_special.trimestrale',    'two_special',    'trimestrale',  'trimestrale',  3),
    ('Annuale · 2 corsi Special',         'two_special.annuale',        'two_special',    'annuale',      'annuale',     12),
    ('Mensile · 3 corsi',                 'three.mensile',              'three',          'mensile',      'mensile',      1),
    ('Trimestrale · 3 corsi',             'three.trimestrale',          'three',          'trimestrale',  'trimestrale',  3),
    ('Annuale · 3 corsi',                 'three.annuale',              'three',          'annuale',      'annuale',     12),
    ('Mensile · All You Can Dance',       'unlimited.mensile',          'unlimited',      'mensile',      'mensile',      1),
    ('Trimestrale · All You Can Dance',   'unlimited.trimestrale',      'unlimited',      'trimestrale',  'trimestrale',  3),
    ('Annuale · All You Can Dance',       'unlimited.annuale',          'unlimited',      'annuale',      'annuale',     12)
), candidates as (
  select
    lo.id,
    case
      when lo.value is not null and trim(lo.value) like '{%' then lo.value::jsonb
      else '{}'::jsonb
    end as metadata,
    sp.pricing_key,
    sp.pricing_group,
    sp.pricing_period,
    sp.tipo,
    sp.durata_mesi
  from public.lookup_options lo
  join standard_packages sp
    on lower(trim(lo.label)) = lower(trim(sp.label))
    or (
      lo.value is not null
      and trim(lo.value) like '{%'
      and coalesce((lo.value::jsonb ->> 'pricing_key'), '') = sp.pricing_key
    )
  where lo.section_key = 'pagamenti'
    and lo.list_key = 'pacchetti_corsi'
)
update public.lookup_options lo
set value = (
  candidates.metadata
  || jsonb_build_object(
      'schema', 2,
      'tipo', candidates.tipo,
      'durata_mesi', candidates.durata_mesi,
      'pricing_key', candidates.pricing_key,
      'pricing_group', candidates.pricing_group,
      'pricing_period', candidates.pricing_period,
      'course_ids', '[]'::jsonb
    )
)::text
from candidates
where lo.id = candidates.id;

-- 2) Controllo finale: sui pacchetti standard course_ids deve essere []
--    e pricing_key non deve essere null.
select
  id,
  label,
  value::jsonb ->> 'pricing_key' as pricing_key,
  value::jsonb -> 'course_ids' as course_ids,
  value::jsonb ->> 'prezzo' as prezzo
from public.lookup_options
where section_key = 'pagamenti'
  and list_key = 'pacchetti_corsi'
order by sort_order, label;

commit;
