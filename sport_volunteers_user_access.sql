-- Nova: abilita la consultazione dei volontari anche agli utenti normali attivi
-- Le scritture (creazione, modifica ed eliminazione) restano riservate agli admin.

alter table public.sport_volunteers enable row level security;

drop policy if exists "sport_volunteers_admin_select" on public.sport_volunteers;
drop policy if exists "sport_volunteers_authenticated_select" on public.sport_volunteers;

create policy "sport_volunteers_authenticated_select"
on public.sport_volunteers
for select
to authenticated
using (exists (
  select 1
  from public.users u
  where u.id = auth.uid()
    and lower(u.role) in ('admin', 'user')
    and u.is_active = true
));

notify pgrst, 'reload schema';
