Ordine consigliato:

1. Esegui `sql_lookup_contabilita_migration.sql` nel SQL Editor di Supabase.
2. Sostituisci `src/pages/ContiPage.jsx` con `ContiPage_updated.jsx`.
3. Sostituisci `src/api/contabilita.js` con `contabilita_lookup_based.js`.
4. Sostituisci `src/utils/contabilitaExport.js` con `contabilitaExport_lookup_based.js`.
5. Apri Conti > Contabilità e verifica tutte le classificazioni importate dai vecchi conti.

Cosa cambia:
- il rendiconto non si basa più su `nature`
- ogni movimento viene classificato in base a `entries.account_code`
- la mappatura viene letta da `lookup_options`
- PDF ed Excel usano la stessa classificazione dei conti

Nota importante:
la migrazione iniziale classifica molti conti in modo sensato, ma devi comunque rifinire le voci nella pagina Conti > Contabilità per avere un rendiconto davvero pulito.

Aggiornamento pacchetti per mese di competenza (03/09/2026):
- Esegui `package_pricing_history.sql` nel SQL Editor del progetto Supabase Orchidea Allievi.
- Lo script crea lo storico delle quote e fotografa le quote correnti come baseline.
- Da quel momento le modifiche ai pacchetti partono dal mese selezionato e non riscrivono i mesi precedenti.

Aggiornamento catalogo pacchetti e coperture (06/09/2026):
- Esegui `packages_and_payment_coverage.sql` nel SQL Editor del progetto Supabase Orchidea Allievi.
- Imposta su Vercel le service role key seguendo `VERCEL_ADMIN_AUTH_SETUP.md` nella root del progetto.
- Fai un nuovo deploy dopo aver aggiunto le variabili ambiente.
