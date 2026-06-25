-- FIX "Profilo non trovato" - database Nova/Gest
-- Eseguire nel progetto Supabase del gestionale Nova, NON in Orchidea Allievi.

-- 1) password_hash è legacy: il login vero passa da Supabase Auth.
ALTER TABLE public.users
ALTER COLUMN password_hash DROP NOT NULL;

-- 2) Permette all'utente autenticato di leggere il proprio profilo anche se
--    la vecchia riga public.users ha un id diverso ma la stessa email.
DROP POLICY IF EXISTS "authenticated users can read own user profile" ON public.users;
DROP POLICY IF EXISTS "users_select_own_id_or_email" ON public.users;

CREATE POLICY "users_select_own_id_or_email"
ON public.users
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR lower(email) = lower(auth.jwt() ->> 'email')
);

-- 3) Crea/aggiorna il profilo del nuovo account gestionale se non esiste già.
--    Se esiste una vecchia riga con la stessa email ma id diverso, il codice aggiornato la leggerà via email.
INSERT INTO public.users (
  id,
  email,
  password_hash,
  role,
  is_active,
  created_at
)
SELECT
  au.id,
  au.email,
  'managed_by_supabase_auth',
  'admin',
  true,
  now()
FROM auth.users au
WHERE lower(au.email) = lower('manuelmia01385@gmail.com')
  AND NOT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = au.id
       OR lower(u.email) = lower(au.email)
  )
ON CONFLICT (id) DO UPDATE
SET
  email = EXCLUDED.email,
  role = 'admin',
  is_active = true,
  password_hash = COALESCE(public.users.password_hash, 'managed_by_supabase_auth');

-- 4) Se la riga esiste già per email, rendila admin e attiva.
UPDATE public.users u
SET
  role = 'admin',
  is_active = true,
  password_hash = COALESCE(u.password_hash, 'managed_by_supabase_auth')
FROM auth.users au
WHERE lower(au.email) = lower('manuelmia01385@gmail.com')
  AND lower(u.email) = lower(au.email);

-- 5) Verifica finale.
SELECT
  u.id AS public_user_id,
  au.id AS auth_user_id,
  u.email,
  u.role,
  u.is_active,
  CASE WHEN u.id = au.id THEN 'ID_OK' ELSE 'ID_DIVERSO_MA_EMAIL_OK' END AS stato
FROM public.users u
JOIN auth.users au ON lower(au.email) = lower(u.email)
WHERE lower(u.email) = lower('manuelmia01385@gmail.com');
