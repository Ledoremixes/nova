# Nova - configurazione backend protetto per utenti e reset password

Le nuove funzioni di amministrazione Auth usano API server-side Vercel: le service role key NON vengono mai inviate al browser.

In Vercel > Project > Settings > Environment Variables aggiungi:

- `SUPABASE_SERVICE_ROLE_KEY` = service role key del progetto Supabase usato da Nova.
- `ORCHIDEA_SUPABASE_SERVICE_ROLE_KEY` = service role key del progetto Supabase usato da Orchidea Allievi.
- `ORCHIDEA_SUPABASE_URL` = URL del progetto Orchidea Allievi. Se hai già `VITE_ORCHIDEA_SUPABASE_URL`, il backend usa anche quello come fallback, ma è consigliato aggiungere la variabile server.

Non usare mai il prefisso `VITE_` per una service role key.
Dopo aver aggiunto le variabili fai un nuovo deploy su Vercel.

Le API `/api/admin-users` e `/api/orchidea-auth-users` verificano prima che la sessione corrente appartenga a un utente Nova con ruolo `admin` e `is_active = true`.

Con entrambe le service role configurate, quando l'admin crea/modifica/elimina un utente Nova, Nova sincronizza anche l'account Auth sul progetto Orchidea Allievi con la stessa email/password. Questo evita che il nuovo operatore entri in Nova ma non riesca ad aprire Tesserati, Corsi o Pagamenti.
