# Fix gestione tesserati Nova + Orchidea Allievi

## Problema corretto

L'errore `Could not find the table public.tesseramenti in the schema cache` succedeva perché Nova stava interrogando la tabella `tesseramenti` sul database Supabase di Nova, dove quella tabella non esiste.

La contabilità deve continuare a usare il database Nova, mentre i tesserati corretti devono arrivare dal database del portale `orchidea-allievi`.

## Cosa è stato modificato

- Aggiunto client Supabase separato per il database allievi: `src/api/orchideaSupabase.js`.
- La sezione Tesserati ora prova a leggere `public.tesseramenti` dal database Orchidea Allievi.
- Se il database allievi non è configurato, Nova non si rompe più: usa temporaneamente la vecchia tabella `tesserati` di Nova e mostra un avviso giallo nella pagina.
- La dashboard non va più in errore se `tesseramenti` non esiste nel database Nova.
- La grafica Nova della pagina tesserati è stata mantenuta.
- È stata mantenuta la scheda allievo con apertura/modifica campi.

## Variabili da configurare su Vercel

Nel progetto Nova su Vercel aggiungi queste variabili usando gli stessi valori del progetto `orchidea-allievi`:

```env
VITE_ORCHIDEA_SUPABASE_URL=...
VITE_ORCHIDEA_SUPABASE_ANON_KEY=...
```

Le variabili già presenti di Nova devono restare uguali:

```env
VITE_SUPABASE_URL=database Nova / contabilità
VITE_SUPABASE_ANON_KEY=database Nova / contabilità
```

## Nota login/admin

Il database Orchidea Allievi usa le policy RLS di Supabase: per vedere e modificare tutti i tesserati, l'utente deve risultare admin attivo anche nel database allievi, nella tabella `profiles`.

Dopo aver configurato le variabili su Vercel:

1. redeploy del progetto Nova;
2. logout da Nova;
3. nuovo login.

Se Nova e orchidea-allievi usano email/password admin diverse, conviene creare lo stesso account admin in entrambi i Supabase oppure usare la stessa email admin per entrambi, altrimenti il secondo login verso il database allievi non può aprire una sessione valida.
