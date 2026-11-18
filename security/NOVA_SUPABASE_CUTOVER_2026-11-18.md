# Orchidea / Nova — piano di chiusura RPC privilegiati (NON APPLICATO)

Data: 18 novembre 2026. Progetto database **Orchidea website**: `egiszddctzwamzndsbtx`.
Codice di preparazione: branch `security/nova-server-first-tesseramenti-20261118` del repository `Ledoremixes/nova`.

> **ATTENZIONE: questo file NON è una migrazione automatica.**
> Non eseguire le istruzioni di modifica finché i test end-to-end con operatori Nova non sono riusciti.
> Non creare utenti fittizi né registrare pagamenti reali per i test.

## Architettura verificata

- Nova ha la propria istanza Supabase `Gest` (`ppkvazistdirigsnochv`).
- L'archivio tesseramenti/pagamenti usato dal sito Orchidea è nel progetto Supabase `website` (`egiszddctzwamzndsbtx`).
- Le API Nova su Vercel verificano il token in `Gest` e possono utilizzare la chiave server del progetto Orchidea tramite variabili riservate.
- La nuova API `/api/orchidea-students?rpc=1` utilizza un elenco chiuso di RPC e verifica ruolo e sessione Nova.

## Prerequisiti inderogabili

1. Confermare che il backup fisico Supabase Pro più recente sia presente. **Non ripristinare la produzione per prova.** Storage contiene oggetti che non sono coperti dai backup del database.
2. Verificare che **Nova main** sia su Vercel con stato `READY`, senza modifiche alle variabili di ambiente.
3. Testare con account operatori reali tramite anteprima o ambiente di test: elenco tesserati (più di 3000 record), dettaglio con iscrizioni e pagamenti, modifica scheda, corsista, numerazione tessera, corsi, pacchetti, iscrizioni, compensi, cassa e storico pagamenti.
4. Verificare che l'API server con token assente restituisca 401 e che un ruolo non abilitato riceva 403; testare le stesse azioni autorizzate su dati di prova in ambiente isolato.
5. Verificare con i log applicativi che tutti gli utilizzi delle 13 RPC elencate passino realmente dal server, inclusi eventuali altri client.
6. Preparare e conservare la procedura di rollback; effettuare la modifica **solo** in una finestra concordata a basso utilizzo.

## Fase A — revoca delle RPC pubbliche (non eseguita)

Le 13 RPC `SECURITY DEFINER` seguenti non hanno controlli espliciti di autenticazione nel corpo SQL e sono eseguibili da `anon`.

**SQL da applicare solamente DOPO la convalida e il rollout delle API protette:**

```sql
BEGIN;
SET LOCAL lock_timeout = '2s';
REVOKE EXECUTE ON FUNCTION public.nova_aggiorna_quota_iscrizione(uuid,numeric,numeric,numeric,text,numeric,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.nova_assegna_corso_insegnante(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.nova_corsi_list() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.nova_corso_partecipanti(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.nova_iscrivi_allievo_corso(uuid,uuid,numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.nova_pagamenti_allievi_mese(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.nova_rimuovi_corso_insegnante(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.nova_rimuovi_iscrizione_corso(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.nova_set_pagamento_allievo_mese(uuid,text,numeric,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.nova_tesseramenti_list() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.nova_tesseramento_details(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.nova_update_corso(uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.nova_update_tesseramento(uuid,jsonb) FROM PUBLIC, anon, authenticated;
COMMIT;
```

La revoca non elimina né modifica alcun record e conserva la possibilità di chiamare le funzioni tramite ruolo server privilegiato. Va comunque trattata come modifica **potenzialmente incompatibile** con client legacy.

**Query di verifica (sola lettura, prima e dopo la modifica):**

```sql
SELECT p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_can_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS server_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN (
    'nova_aggiorna_quota_iscrizione',
    'nova_assegna_corso_insegnante',
    'nova_corsi_list',
    'nova_corso_partecipanti',
    'nova_iscrivi_allievo_corso',
    'nova_pagamenti_allievi_mese',
    'nova_rimuovi_corso_insegnante',
    'nova_rimuovi_iscrizione_corso',
    'nova_set_pagamento_allievo_mese',
    'nova_tesseramenti_list',
    'nova_tesseramento_details',
    'nova_update_corso',
    'nova_update_tesseramento'
  )
ORDER BY p.proname;
```

Risultato atteso: `anon_can_execute=false`, `auth_can_execute=false`, `server_can_execute=true` per tutte le 13 funzioni. Controllare i 401/403/500 lato Nova prima di proseguire.

## Rollback Fase A — usare solo se necessario

```sql
BEGIN;
SET LOCAL lock_timeout = '2s';
GRANT EXECUTE ON FUNCTION public.nova_aggiorna_quota_iscrizione(uuid,numeric,numeric,numeric,text,numeric,text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nova_assegna_corso_insegnante(uuid,text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nova_corsi_list() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nova_corso_partecipanti(uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nova_iscrivi_allievo_corso(uuid,uuid,numeric) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nova_pagamenti_allievi_mese(text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nova_rimuovi_corso_insegnante(uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nova_rimuovi_iscrizione_corso(uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nova_set_pagamento_allievo_mese(uuid,text,numeric,text,text,text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nova_tesseramenti_list() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nova_tesseramento_details(uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nova_update_corso(uuid,jsonb) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nova_update_tesseramento(uuid,jsonb) TO PUBLIC, anon, authenticated;
COMMIT;
```

**Nota:** questo rollback ripristina i permessi originali documentati il 18 novembre 2026, ma riapre la precedente esposizione. La riapertura deve essere temporanea e tracciata.

## Fase B — RLS tabelle principali (NON pronta per l'applicazione)

Restano policy `USING(true)` / `WITH CHECK(true)` per ruoli `anon` o `authenticated` su:
`tesseramenti`, `pagamenti`, `iscrizioni_corsi`, `corsi`,
`insegnanti`, `insegnanti_corsi` e altre superfici.

**Non revocare ancora queste policy.** `src/api/orchideaPayments.js` e `src/api/orchideaEntities.js` usano ancora letture e scritture dirette dal browser per operazioni sensibili. Prima occorre portare **tutte** quelle operazioni su API server con controlli di autorizzazione, poi verificarle e applicare modifiche RLS atomiche.

## Ulteriori criticità da pianificare

- `public.v_nova_compensi_insegnanti`: vista di default con privilegi di definizione e SELECT per anon/authenticated. Verificare gli utilizzi e restringere gli accessi.
- Rotazione graduale dei segreti eventualmente presenti nella storia Git.
- Revisione dell'accesso iniziale con codice fiscale; preferire verifiche via canale controllato.
- Protezione del sito con rate limiting e monitoraggio sugli endpoint sensibili, senza attivare blocchi in massa prima di valutare il traffico.
