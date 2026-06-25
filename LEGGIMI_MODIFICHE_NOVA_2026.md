# Modifiche Nova 2026

Questa versione aggiorna Nova con:

- pagamenti: ora legge tutte le uscite, quindi anche affitto di giugno se registrato in prima nota;
- dashboard: andamento mensile calcolato direttamente dai movimenti `entries`, senza RPC vecchie;
- dashboard ultimi tesserati: ora legge da Orchidea Allievi;
- gruppi: sostituiti con vista corsi/partecipanti da Orchidea Allievi;
- atleti: ricerca e lista da `tesseramenti` di Orchidea Allievi;
- insegnanti: collegamento a Orchidea Allievi, con fallback a vecchio archivio Nova;
- utenti: sezione amministrazione rimossa/indirizzata a Utenti; gestione ruoli admin/user;
- utenti normali: non vedono contabilità, pagamenti, prima nota, conti, visite mediche, utilità e cifre dashboard;
- tesserati: scheda allievo più completa e reset password allievo solo admin;
- visite mediche: nuova sezione con selezione corsista e upload foto/PDF;
- account: modifica profilo personale, email e password;
- eliminate dal menu: allenatori, fatturazione, app, iscrizioni online;
- lookup_options globali: non dipendono più da `user_id`.

## SQL da eseguire

1. Nel database Supabase del gestionale Nova esegui:
   `SQL_NOVA_GESTIONALE_MODIFICHE_2026.sql`

2. Nel database Supabase di Orchidea Allievi esegui:
   `SQL_ORCHIDEA_ALLIEVI_MODIFICHE_2026.sql`

## Variabili d'ambiente richieste

Le variabili Nova devono restare del database Nova:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Le variabili Orchidea Allievi devono puntare al portale allievi:

```env
VITE_ORCHIDEA_SUPABASE_URL=
VITE_ORCHIDEA_SUPABASE_ANON_KEY=
```
