# Fix variabili Vercel / tesserati Orchidea

Questo ZIP non contiene la cartella `dist` precompilata.

Il problema visto nello screenshot era questo: l'app mostrava ancora "Nova legacy", quindi il bundle pubblicato era stato generato senza `VITE_ORCHIDEA_SUPABASE_URL` e `VITE_ORCHIDEA_SUPABASE_ANON_KEY`.

Con Vite, le variabili `VITE_*` vengono lette durante la build. Dopo averle aggiunte su Vercel devi fare un nuovo deploy.

## Impostazioni Vercel consigliate

- Framework Preset: Vite
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: `dist`

Nel progetto sono già incluse anche queste impostazioni in `vercel.json`.

## Variabili necessarie

Per Nova:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Per i tesserati reali di orchidea-allievi:
- `VITE_ORCHIDEA_SUPABASE_URL`
- `VITE_ORCHIDEA_SUPABASE_ANON_KEY`

Dopo aver caricato questo ZIP fai un nuovo deploy, poi logout e login.
