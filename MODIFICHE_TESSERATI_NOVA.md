# Modifiche applicate - Tesserati Nova

- La sezione `Tesserati` di Nova ora legge la tabella ufficiale `tesseramenti`, la stessa usata da `orchidea-allievi` e dal portale online.
- Rimossa la logica della vecchia tabella `tesserati` dalla pagina principale dei tesserati.
- Aggiunta scheda allievo in stile Nova con modifica di: nome, cognome, email, telefono, codice fiscale, nascita, luogo, residenza, numero tessera, stagione, stato tessera, stato pagamento, tessera attiva e ruolo corsista.
- Aggiunta la stessa logica `membershipCode` di orchidea-allievi: usa `numero_tessera` se presente, altrimenti genera il codice `TESS-...` dall'id del tesseramento.
- Aggiunta generazione numero progressivo `ORC-000001`, `ORC-000002`, ecc. come in orchidea-allievi.
- La dashboard Nova ora conta i tesserati dalla tabella `tesseramenti`.
- L'autenticazione Nova ora prova prima la tabella `users` e poi la tabella `profiles`, così resta compatibile anche con gli admin di orchidea-allievi.

Build verificata con `npm run build` dopo reinstallazione dipendenze locali.

Nota: per vedere e modificare tutti i tesserati, l'utente autenticato deve risultare admin anche nella logica Supabase/RLS di orchidea-allievi, cioè nella tabella `profiles` con `role = 'admin'` e `is_active = true`.
