-- =========================================================
-- SQL PER DATABASE: NOVA GESTIONALE
-- Esegui questo file nel progetto Supabase del gestionale Nova.
-- NON eseguirlo nel database Orchidea Allievi.
-- =========================================================

-- 1) lookup_options globali: le voci di menu non devono dipendere dall'utente che le ha create.
ALTER TABLE public.lookup_options
ALTER COLUMN user_id DROP NOT NULL;

WITH duplicated AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY section_key, list_key, lower(trim(label)), lower(trim(coalesce(value, '')))
      ORDER BY created_at NULLS LAST, id
    ) AS rn
  FROM public.lookup_options
)
DELETE FROM public.lookup_options
WHERE id IN (SELECT id FROM duplicated WHERE rn > 1);

UPDATE public.lookup_options
SET user_id = NULL;

CREATE OR REPLACE FUNCTION public.force_lookup_options_global()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.user_id := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_force_lookup_options_global ON public.lookup_options;
CREATE TRIGGER trg_force_lookup_options_global
BEFORE INSERT OR UPDATE ON public.lookup_options
FOR EACH ROW
EXECUTE FUNCTION public.force_lookup_options_global();

ALTER TABLE public.lookup_options ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lookup_options'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.lookup_options', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "lookup_options_select_authenticated"
ON public.lookup_options
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "lookup_options_insert_authenticated"
ON public.lookup_options
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "lookup_options_update_authenticated"
ON public.lookup_options
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "lookup_options_delete_authenticated"
ON public.lookup_options
FOR DELETE
TO authenticated
USING (true);


-- 2) Tabella profilo account personale Nova.
CREATE TABLE IF NOT EXISTS public.account_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  phone text,
  notification_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.account_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "account_profiles_select_own" ON public.account_profiles;
DROP POLICY IF EXISTS "account_profiles_insert_own" ON public.account_profiles;
DROP POLICY IF EXISTS "account_profiles_update_own" ON public.account_profiles;

CREATE POLICY "account_profiles_select_own"
ON public.account_profiles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "account_profiles_insert_own"
ON public.account_profiles
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "account_profiles_update_own"
ON public.account_profiles
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());


-- 3) Visite mediche caricate in Nova, collegate ai tesseramenti di Orchidea Allievi tramite tesseramento_id.
CREATE TABLE IF NOT EXISTS public.medical_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  tesseramento_id uuid NOT NULL,
  student_name text NOT NULL,
  student_email text,
  issued_at date,
  expires_at date,
  doctor text,
  notes text,
  file_path text,
  file_name text,
  file_mime text,
  status text NOT NULL DEFAULT 'valida',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_medical_visits_tesseramento_id ON public.medical_visits(tesseramento_id);
CREATE INDEX IF NOT EXISTS idx_medical_visits_expires_at ON public.medical_visits(expires_at);

ALTER TABLE public.medical_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "medical_visits_select_authenticated" ON public.medical_visits;
DROP POLICY IF EXISTS "medical_visits_insert_authenticated" ON public.medical_visits;
DROP POLICY IF EXISTS "medical_visits_update_authenticated" ON public.medical_visits;
DROP POLICY IF EXISTS "medical_visits_delete_authenticated" ON public.medical_visits;

CREATE POLICY "medical_visits_select_authenticated"
ON public.medical_visits
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "medical_visits_insert_authenticated"
ON public.medical_visits
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "medical_visits_update_authenticated"
ON public.medical_visits
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "medical_visits_delete_authenticated"
ON public.medical_visits
FOR DELETE
TO authenticated
USING (true);


-- 4) Bucket storage per foto/PDF visite mediche.
INSERT INTO storage.buckets (id, name, public)
VALUES ('medical-visits', 'medical-visits', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "medical_visits_storage_select_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "medical_visits_storage_insert_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "medical_visits_storage_update_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "medical_visits_storage_delete_authenticated" ON storage.objects;

CREATE POLICY "medical_visits_storage_select_authenticated"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'medical-visits');

CREATE POLICY "medical_visits_storage_insert_authenticated"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'medical-visits');

CREATE POLICY "medical_visits_storage_update_authenticated"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'medical-visits')
WITH CHECK (bucket_id = 'medical-visits');

CREATE POLICY "medical_visits_storage_delete_authenticated"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'medical-visits');


-- 5) Policy utenti Nova: ogni utente legge il proprio profilo; admin legge/modifica tutti.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_or_admin" ON public.users;
DROP POLICY IF EXISTS "users_update_admin" ON public.users;

CREATE POLICY "users_select_own_or_admin"
ON public.users
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.users admin_user
    WHERE admin_user.id = auth.uid()
      AND admin_user.role = 'admin'
      AND admin_user.is_active = true
  )
);

CREATE POLICY "users_update_admin"
ON public.users
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users admin_user
    WHERE admin_user.id = auth.uid()
      AND admin_user.role = 'admin'
      AND admin_user.is_active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users admin_user
    WHERE admin_user.id = auth.uid()
      AND admin_user.role = 'admin'
      AND admin_user.is_active = true
  )
);


-- 6) Facoltativo: sincronizza l'utente nuovo come admin Nova se esiste in auth.users.
INSERT INTO public.users (id, email, role, is_active, created_at)
SELECT id, email, 'admin', true, now()
FROM auth.users
WHERE email = 'manuelmia01385@gmail.com'
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    role = 'admin',
    is_active = true;
