-- Nova Gestionale ASD
-- Funzione di supporto per eliminare un corso quando le policy RLS del database
-- Orchidea Allievi impediscono il DELETE diretto dal client.
-- Eseguire nel SQL Editor del progetto Supabase di Orchidea Allievi.

create or replace function public.nova_delete_corso(p_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course jsonb;
begin
  if auth.uid() is null then
    raise exception 'Utente non autenticato';
  end if;

  delete from public.corsi
  where id::text = p_id
  returning to_jsonb(corsi.*) into v_course;

  if v_course is null then
    raise exception 'Corso non trovato o già eliminato';
  end if;

  return v_course;
exception
  when foreign_key_violation then
    raise exception 'Il corso ha iscrizioni o dati collegati e non può essere eliminato';
end;
$$;

revoke all on function public.nova_delete_corso(text) from public;
grant execute on function public.nova_delete_corso(text) to authenticated;

notify pgrst, 'reload schema';
