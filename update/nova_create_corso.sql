-- Nova Gestionale ASD
-- Funzione di supporto per creare corsi quando le policy RLS del database
-- Orchidea Allievi impediscono l'INSERT diretto dal client.
-- Eseguire nel SQL Editor del progetto Supabase di Orchidea Allievi.

create or replace function public.nova_create_corso(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course public.corsi%rowtype;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Utente non autenticato';
  end if;

  v_name := nullif(btrim(p_payload ->> 'nome'), '');
  if v_name is null then
    raise exception 'Il nome del corso è obbligatorio';
  end if;

  insert into public.corsi (
    nome,
    disciplina,
    livello,
    giorno_settimana,
    ora_inizio,
    ora_fine,
    prezzo_mensile,
    sala,
    insegnante,
    descrizione,
    attivo,
    colore,
    updated_at
  )
  values (
    v_name,
    nullif(btrim(p_payload ->> 'disciplina'), ''),
    nullif(btrim(p_payload ->> 'livello'), ''),
    nullif(btrim(p_payload ->> 'giorno_settimana'), ''),
    nullif(p_payload ->> 'ora_inizio', '')::time,
    nullif(p_payload ->> 'ora_fine', '')::time,
    nullif(p_payload ->> 'prezzo_mensile', '')::numeric,
    nullif(btrim(p_payload ->> 'sala'), ''),
    nullif(btrim(p_payload ->> 'insegnante'), ''),
    nullif(btrim(p_payload ->> 'descrizione'), ''),
    coalesce((p_payload ->> 'attivo')::boolean, true),
    coalesce(nullif(p_payload ->> 'colore', ''), '#6d5dfc'),
    now()
  )
  returning * into v_course;

  return to_jsonb(v_course);
end;
$$;

revoke all on function public.nova_create_corso(jsonb) from public;
grant execute on function public.nova_create_corso(jsonb) to authenticated;

notify pgrst, 'reload schema';
