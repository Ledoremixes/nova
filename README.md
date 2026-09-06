# Nova Gestionale ASD

Gestionale React/Vite per Club Orchidea ASD.

## Avvio locale

```bash
npm install
npm run dev
```

`npm run dev` espone anche le API locali usate da Nova (`/api/admin-users`, `/api/orchidea-auth-users`, `/api/packages-catalog`), quindi gestione utenti e funzioni admin non restituiscono più 404 durante lo sviluppo con Vite.

## Variabili ambiente

Copia `.env.example` in `.env` e configura almeno:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (solo backend/API)
- `VITE_ORCHIDEA_SUPABASE_URL`
- `VITE_ORCHIDEA_SUPABASE_ANON_KEY`
- `ORCHIDEA_SUPABASE_SERVICE_ROLE_KEY` se vuoi permettere a Nova di modificare direttamente le password degli account Auth del portale Orchidea Allievi.

Non usare mai una service-role con prefisso `VITE_`.

## Pacchetti

Il catalogo è salvato nelle `lookup_options` globali del database Nova. Al primo avvio con catalogo vuoto, Nova crea automaticamente:

- **A gettone** — **12,00 €** — una singola lezione, senza copertura mensile.

I gettoni vengono registrati come movimenti separati e non possono segnare il mese come pagato. Più gettoni nello stesso mese restano più lezioni singole, non una quota mensile.

## Migrazione pagamenti

`packages_and_payment_coverage.sql` va eseguito sul database Orchidea Allievi se non sono ancora presenti i campi `nova_*` nella tabella `pagamenti`.

## Verifiche

```bash
npm run lint
npm run build
```
