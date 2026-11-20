# Cutover controllato Nova → Supabase Orchidea

**Rischio:** Nova usa un'istanza Auth propria, differente da quella di Orchidea. Prima della modifica alcune letture/scritture erano abilitate tramite policy RLS permissive (anche anonymous). Non revocare i permessi di produzione senza un backend già funzionante.

## Fase A — deploy senza alterare il traffico
1. Distribuire questa PR con `VITE_NOVA_ORCHIDEA_SECURE_BRIDGE` **assente o diverso da `true`**. Di default TUTTE le operazioni browser utilizzano il percorso precedente.
2. Controllare il deploy Vercel READY, login Nova, tesserati, lista pagamenti, homepage, consultazione corsi e registrazioni. Non ci sono nuove tabelle né nuovi costi.
3. L'endpoint server riusa `/api/orchidea-payments-read` già esistente. Valida sempre token Nova, ruolo e account attivo; la chiave Orchidea viene utilizzata solo sul server.
4. Validare le variabili `ORCHIDEA_SUPABASE_SERVICE_ROLE_KEY`, `VITE_ORCHIDEA_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` già presenti **senza copiarle nei log**.

## Fase B — abilitazione gateway con vecchie RLS ancora attive
1. Solo durante una finestra di supervisione: impostare `VITE_NOVA_ORCHIDEA_SECURE_BRIDGE=true` in Vercel e ridistribuire.
2. Con un account Nova operatore verificare una lettura di 50 tesseramenti, dettaglio di un allievo, corsi, quote mensili e storico.
3. Con un record di prova isolato verificare INSERT, UPDATE, DELETE di un pagamento (anche gettone), controllo mensile e rollback di pacchetto. Non provare su un pagamento reale non reversibile.
4. Verificare sincronizzazione tesserati, note corso, iscrizione, rinnovo, docente e accessi admin.
5. Monitorare errori API 401/403/409/5xx. In caso di blocco, togliere flag e ridistribuire, senza cambiare RLS.
6. Non utilizzare il preview come test di produzione se manca la chiave service-role in preview: un build READY non prova l'autenticazione end-to-end.

## Fase C — RLS (dipende da B e Orchidea Allievi)
1. Pubblicare il controllo corsista della PR `Ledoremixes/orchidea-allievi#3`, verificando studente, amministratore e insegnante autorizzato.
2. Verificare con **due** account distinti che lo studente A legga i propri pagamenti ma NON quelli di B, anche cambiando manualmente l'ID della richiesta.
3. Preparare backup Supabase Pro, rollback e test transazionali.
4. Applicare in un'unica operazione il file `REVIEW-ONLY-all-sensitive-rls-cutover-2026-11-20.sql` sul repository Orchidea, dopo revisione finale di tutte le dipendenze.
5. Ricontrollare sito, modulo di tesseramento, segreteria Nova, app allievi, area tesserati, pagamenti e liste corsi. Revocare le RPC legacy anonime `nova_*` solo dopo la verifica del gateway.

## Principio
La segreteria continua ad accedere **solo a Nova**. Non serve una seconda sessione Orchidea: il backend Nova verifica l'operatore e usa una chiave server. La chiave privilegiata non appare nel browser. Nessuna restrizione RLS viene applicata da questa PR.
