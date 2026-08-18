-- =========================================================================
-- GESTION SCOLAIRE SUITE — Mise à jour : invitations multi-rôles
-- =========================================================================
-- À exécuter UNE FOIS dans Supabase SQL Editor. Ce script remplace la
-- fonction du trigger d'inscription pour qu'elle prenne en compte un rôle
-- explicite (secretary, accountant, teacher, parent, student, admin)
-- envoyé par la fonction Edge "invite-user", tout en gardant le
-- comportement existant pour l'inscription publique (toujours "admin")
-- et pour vous (platform_admin quand school_id est vide).
-- =========================================================================

create or replace function public.handle_new_school_admin()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta_school_id uuid;
  meta_role text;
  resolved_role user_role;
begin
  meta_school_id := (new.raw_user_meta_data->>'school_id')::uuid;
  meta_role := new.raw_user_meta_data->>'role';

  if meta_school_id is null then
    -- Inscription "Nouveau ? Inscrire mon établissement" côté vous-même,
    -- ou tout compte sans établissement rattaché.
    resolved_role := 'platform_admin';
  elsif meta_role in ('admin','secretary','accountant','teacher','parent','student') then
    -- Invitation envoyée par la fonction Edge "invite-user", avec un rôle
    -- explicite et validé côté serveur.
    resolved_role := meta_role::user_role;
  else
    -- Inscription publique d'un nouvel établissement : toujours "admin".
    resolved_role := 'admin';
  end if;

  insert into public.profiles (id, school_id, email, full_name, role)
  values (
    new.id,
    meta_school_id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    resolved_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Le trigger existant pointe déjà vers cette fonction, rien d'autre à faire.
