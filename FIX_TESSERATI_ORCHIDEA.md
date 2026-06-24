# Fix gestione tesserati Nova + Orchidea Allievi

## Problema corretto

Nova e `orchidea-allievi` usano due database Supabase diversi.

Le variabili `VITE_ORCHIDEA_SUPABASE_URL` e `VITE_ORCHIDEA_SUPABASE_ANON_KEY` permettono a Nova di collegarsi al database corretto, ma non bastano da sole: se il client non ha anche una sessione Supabase valida su `orchidea-allievi`, le policy RLS possono restituire 0 tesserati senza mostrare un errore evidente.

Nel caso visto a schermo, Nova diceva "collegamento attivo" perché il database era configurato, ma non stava verificando se l'utente fosse autenticato anche sul database allievi.

## Cosa è stato modificato

- Aggiunto controllo reale della sessione su `orchidea-allievi`.
- La pagina Tesserati ora mostra se la sessione allievi è attiva e con quale email.
- Se manca la sessione allievi, la pagina non mostra più falsamente "collegamento attivo": avvisa di fare logout/login con l'account admin del portale allievi.
- Il login prova ad autenticare l'utente sia sul database Nova sia sul database Orchidea Allievi.
- Il login ora può funzionare anche se l'account admin esiste solo nel database di `orchidea-allievi`, usando il profilo admin da `profiles`.
- La contabilità continua a usare il database Nova tramite `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
- La sezione tesserati continua a leggere `public.tesseramenti` dal database di `orchidea-allievi`.
- La grafica Nova e la scheda allievo con modifica campi sono state mantenute.

## Variabili da configurare su Vercel

Nel progetto Nova su Vercel devono restare le variabili Nova:

```env
VITE_SUPABASE_URL=database Nova / contabilità
VITE_SUPABASE_ANON_KEY=database Nova / contabilità
```

E vanno aggiunte quelle di `orchidea-allievi`:

```env
VITE_ORCHIDEA_SUPABASE_URL=database Orchidea Allievi
VITE_ORCHIDEA_SUPABASE_ANON_KEY=anon key Orchidea Allievi
```

## Dopo il deploy

1. Redeploy completo su Vercel.
2. Logout da Nova.
3. Login usando la stessa email/password admin che usi su `orchidea-allievi`.

Nel tuo caso, se l'admin del portale allievi è `manuelmia01385@gmail.com`, devi entrare con quello per far leggere i tesserati ufficiali. Se entri con `manuel@orchidea.it` e quell'utente non esiste/ non è admin nel database allievi, Supabase blocca la lettura per RLS e Nova vede 0 tesserati.

## Consiglio pratico

La soluzione più pulita è avere lo stesso account admin in entrambi i progetti Supabase:

- Nova / contabilità
- Orchidea Allievi / tesserati

Così puoi usare una sola email/password e Nova apre correttamente entrambe le sessioni.
