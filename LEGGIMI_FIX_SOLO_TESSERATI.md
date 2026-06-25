# Fix Nova - modifica limitata solo ai tesserati

Questa versione ripristina la logica originale di Nova per:

- login / sessione Nova
- contabilità
- prima nota
- conti
- salvataggio movimenti
- dashboard contabile

La modifica rimane limitata alla sezione `Tesserati`, che può leggere il database Orchidea Allievi tramite queste variabili:

```env
VITE_ORCHIDEA_SUPABASE_URL=
VITE_ORCHIDEA_SUPABASE_ANON_KEY=
```

Le variabili Nova devono rimanere quelle del gestionale Nova:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Attenzione: non sostituire `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` di Nova con quelle di Orchidea Allievi, altrimenti conti e movimenti non vengono più letti dal database corretto.

In locale crea `.env.local` nella root del progetto e riavvia Vite con:

```bash
npm run dev -- --force
```
