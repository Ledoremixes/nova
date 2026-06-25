-- FIX GLOBALE lookup_options NOVA
-- Obiettivo: le voci dei menu/configurazioni devono essere condivise da tutti gli admin,
-- non legate al singolo user_id che le ha create.

-- 1) Permette valori NULL su user_id, necessari per opzioni globali.
ALTER TABLE public.lookup_options
ALTER COLUMN user_id DROP NOT NULL;

-- 2) Rimuove duplicati logici mantenendo una sola voce per section/list/label/value.
WITH duplicated AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY
        section_key,
        list_key,
        lower(trim(coalesce(label, ''))),
        lower(trim(coalesce(value, '')))
      ORDER BY created_at NULLS LAST, id
    ) AS rn
  FROM public.lookup_options
)
DELETE FROM public.lookup_options
WHERE id IN (
  SELECT id
  FROM duplicated
  WHERE rn > 1
);

-- 3) Rende globali tutte le opzioni esistenti.
UPDATE public.lookup_options
SET user_id = NULL;

-- 4) Forza anche le future opzioni a essere globali, anche se qualche vecchio codice invia user_id.
CREATE OR REPLACE FUNCTION public.force_lookup_options_global_user_id()
RETURNS trigger AS $$
BEGIN
  NEW.user_id := NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_force_lookup_options_global_user_id ON public.lookup_options;

CREATE TRIGGER trg_force_lookup_options_global_user_id
BEFORE INSERT OR UPDATE ON public.lookup_options
FOR EACH ROW
EXECUTE FUNCTION public.force_lookup_options_global_user_id();

-- 5) Ricrea le policy RLS per accesso condiviso agli utenti autenticati.
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

-- 6) Query di controllo.
SELECT
  user_id,
  section_key,
  list_key,
  label,
  value,
  is_active
FROM public.lookup_options
ORDER BY section_key, list_key, label;
