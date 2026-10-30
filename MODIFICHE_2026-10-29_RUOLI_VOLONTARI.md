# Nova - Ruoli volontari personalizzabili

- **Conti > Volontari sportivi > Ruoli dei volontari sportivi**: crea, rinomina, riordina, attiva/disattiva ed elimina i ruoli non assegnati.
- I codici restano immutabili dopo la creazione, per conservare i collegamenti delle anagrafiche esistenti. L'etichetta si può sempre modificare.
- I ruoli configurati sono selezionabili come ruolo principale e aggiuntivo, nei filtri e nei contratti PDF generati.
- I ruoli disattivati non vengono proposti nei nuovi inserimenti, ma restano visibili nelle anagrafiche precedenti.
- Il ruolo 'Addetto cassa' è precaricato con lo script SQL.
- **Installazione**: esegui `NOVA_SQL_RUOLI_VOLONTARI.sql` nel Supabase collegato a Nova, non in Orchidea Allievi. Serve per eliminare il vincolo legacy che rifiuta nuovi ruoli e precaricare il catalogo.
- **Git**: se un rebase è in corso, risolvi prima i conflitti e poi applica i soli file contenuti nella patch. Non sostituire file non elencati.
