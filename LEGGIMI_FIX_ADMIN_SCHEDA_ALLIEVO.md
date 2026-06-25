# Fix admin e scheda allievo

Questa versione corregge due punti:

1. **Admin riconosciuto in modo più robusto**
   - Il ruolo viene normalizzato (`admin`, senza problemi di maiuscole/spazi).
   - La scheda allievo mostra chiaramente se l'utente è admin.

2. **Reset password allievo migliorato**
   - Se `auth_user_id` è presente usa `admin_set_allievo_password`.
   - Se `auth_user_id` manca ma l'allievo ha email, usa `admin_set_allievo_password_by_email`.
   - Il nuovo SQL `SQL_ORCHIDEA_FIX_RESET_PASSWORD_EMAIL.sql` va eseguito nel Supabase di **Orchidea Allievi**.

3. **Scheda allievo aggiornata graficamente**
   - Header più leggibile con avatar, badge tessera/corsista/numero.
   - Form anagrafica più pulito e diviso visivamente.
   - Reset password e blocchi corsi/pagamenti più ordinati.

## SQL da eseguire

Nel database **Orchidea Allievi** eseguire:

```txt
SQL_ORCHIDEA_FIX_RESET_PASSWORD_EMAIL.sql
```

Il database **Nova/Gest** non richiede nuove tabelle per questo fix.
