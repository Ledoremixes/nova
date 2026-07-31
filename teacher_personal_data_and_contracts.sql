-- Nova - anagrafica completa insegnanti e dati contratto Co.Co.Co.
-- Eseguire nel SQL Editor del database che contiene la tabella public.insegnanti.
-- Le ALTER sulla tabella teachers sono incluse per compatibilita con eventuali archivi Nova legacy.

begin;

alter table if exists public.insegnanti
  add column if not exists codice_fiscale text,
  add column if not exists data_nascita date,
  add column if not exists luogo_nascita text,
  add column if not exists provincia_nascita text,
  add column if not exists comune_residenza text,
  add column if not exists provincia_residenza text,
  add column if not exists indirizzo_residenza text,
  add column if not exists cap_residenza text,
  add column if not exists iban text,
  add column if not exists intestatario_iban text,
  add column if not exists contratto_data_inizio date,
  add column if not exists contratto_data_fine date,
  add column if not exists contratto_ruolo text,
  add column if not exists contratto_disciplina text,
  add column if not exists contratto_mansioni text,
  add column if not exists contratto_sede text,
  add column if not exists contratto_giorni_turni text,
  add column if not exists contratto_fasce_orarie text,
  add column if not exists contratto_ore_stimate text,
  add column if not exists contratto_preavviso_giorni integer default 15,
  add column if not exists contratto_periodicita_compenso text default 'mensile',
  add column if not exists contratto_compenso_lordo_netto text default 'lordo',
  add column if not exists contratto_descrizione_compenso text,
  add column if not exists contratto_luogo_firma text default 'Saronno',
  add column if not exists contratto_foro text;

alter table if exists public.teachers
  add column if not exists tax_code text,
  add column if not exists birth_date date,
  add column if not exists birth_place text,
  add column if not exists birth_province text,
  add column if not exists residence_city text,
  add column if not exists residence_province text,
  add column if not exists residence_address text,
  add column if not exists residence_postal_code text,
  add column if not exists iban text,
  add column if not exists bank_account_holder text,
  add column if not exists contract_start_date date,
  add column if not exists contract_end_date date,
  add column if not exists contract_role text,
  add column if not exists contract_discipline text,
  add column if not exists contract_duties text,
  add column if not exists contract_venue text,
  add column if not exists contract_days_turns text,
  add column if not exists contract_time_slots text,
  add column if not exists contract_estimated_hours text,
  add column if not exists contract_notice_days integer default 15,
  add column if not exists contract_compensation_frequency text default 'mensile',
  add column if not exists contract_compensation_tax text default 'lordo',
  add column if not exists contract_compensation_description text,
  add column if not exists contract_signing_place text default 'Saronno',
  add column if not exists contract_competent_court text;

commit;
