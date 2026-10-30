-- NOVA - ruoli dinamici per volontari sportivi (2026-10-29)
-- Eseguire nel SQL Editor del database Supabase collegato a Nova.
-- Non modifica/elimina alcun volontario o ruolo già assegnato.
BEGIN;

-- La definizione originale limitava il ruolo principale a soli 7 codici.
ALTER TABLE public.sport_volunteers
  DROP CONSTRAINT IF EXISTS sport_volunteers_role_check;

-- Si riusa lookup_options, già gestita dalla sezione Conti di Nova.
-- Le insert sono idempotenti: i ruoli configurati manualmente non vengono sovrascritti.
WITH defaults(value, label, sort_order) AS (
  VALUES
    ('barman', 'Barman', 10),
    ('cameriere', 'Cameriere', 20),
    ('barlady', 'Barlady', 30),
    ('ballerino', 'Ballerino', 40),
    ('animatore', 'Animatore', 50),
    ('videomaker', 'Videomaker', 60),
    ('fotografo', 'Fotografo', 70),
    ('addetto_cassa', 'Addetto cassa', 80)
)
INSERT INTO public.lookup_options
  (user_id, section_key, list_key, label, value, sort_order, is_active)
SELECT null, 'volontari', 'ruoli_volontari', d.label, d.value, d.sort_order, true
FROM defaults d
WHERE NOT EXISTS (
  SELECT 1 FROM public.lookup_options l
  WHERE l.section_key = 'volontari'
    AND l.list_key = 'ruoli_volontari'
    AND l.value = d.value
);

COMMIT;
NOTIFY pgrst, 'reload schema';
