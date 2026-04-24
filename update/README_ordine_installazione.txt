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
