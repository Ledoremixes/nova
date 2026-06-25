-- =========================================================
-- DATABASE: ORCHIDEA ALLIEVI
-- Fix reset password allievo anche quando tesseramenti.auth_user_id è vuoto.
-- Esegui questo SQL SOLO nel progetto Supabase di Orchidea Allievi.
-- =========================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.admin_set_allievo_password_by_email(
  p_email text,
  p_new_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  caller_id uuid := auth.uid();
  caller_is_admin boolean := false;
  target_user_id uuid;
  cleaned_email text := lower(trim(p_email));
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Utente non autenticato';
  END IF;

  IF cleaned_email IS NULL OR cleaned_email = '' THEN
    RAISE EXCEPTION 'Email allievo mancante';
  END IF;

  IF p_new_password IS NULL OR length(p_new_password) < 6 THEN
    RAISE EXCEPTION 'La password deve avere almeno 6 caratteri';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = caller_id
      AND lower(p.role) = 'admin'
      AND coalesce(p.is_active, true) = true
  ) OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = caller_id
      AND lower(u.role) = 'admin'
      AND coalesce(u.is_active, true) = true
  ) INTO caller_is_admin;

  IF caller_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Permesso negato: solo admin';
  END IF;

  SELECT au.id INTO target_user_id
  FROM auth.users au
  WHERE lower(au.email) = cleaned_email
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'Nessun account Auth trovato con email %', cleaned_email;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tesseramenti t
    WHERE lower(t.email) = cleaned_email
       OR t.auth_user_id = target_user_id
  ) THEN
    RAISE EXCEPTION 'Nessun tesseramento collegato all email %', cleaned_email;
  END IF;

  UPDATE auth.users
  SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
      updated_at = now(),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      confirmation_token = '',
      recovery_token = ''
  WHERE id = target_user_id;

  -- Se la colonna esiste ed era vuota, collega automaticamente il tesseramento all'account Auth.
  UPDATE public.tesseramenti
  SET auth_user_id = coalesce(auth_user_id, target_user_id),
      updated_at = now()
  WHERE lower(email) = cleaned_email
    AND auth_user_id IS NULL;

  RETURN jsonb_build_object('ok', true, 'user_id', target_user_id, 'email', cleaned_email);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_allievo_password_by_email(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_allievo_password_by_email(text, text) TO authenticated;
