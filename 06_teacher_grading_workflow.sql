-- =========================================================================
-- GESTION SCOLAIRE SUITE — Mise à jour : notes par enseignant + verrouillage
-- =========================================================================
-- À exécuter UNE FOIS dans Supabase SQL Editor.
--
-- Ce que ça met en place :
-- 1. Un lien entre un compte enseignant (profiles) et sa fiche RH (teachers).
-- 2. Une table d'affectations (teacher_assignments) : quelle classe + quelle
--    matière chaque enseignant a le droit de noter.
-- 3. Une table de verrouillage (grade_submissions) : une fois qu'un
--    enseignant a "envoyé" ses notes pour une classe/matière/période, lui
--    seul ne peut plus les modifier — seul le directeur (role "admin") le
--    peut encore.
-- 4. Des policies RLS qui appliquent ces règles au niveau de la base de
--    données elle-même (donc impossible à contourner depuis le navigateur).
-- =========================================================================

-- ---------------------------------------------------------------------
-- 1. Lien compte enseignant ↔ fiche RH
-- ---------------------------------------------------------------------
alter table public.teachers add column if not exists user_id uuid references public.profiles(id) on delete set null;

-- ---------------------------------------------------------------------
-- 2. Affectations classe + matière par enseignant
-- ---------------------------------------------------------------------
create table if not exists public.teacher_assignments (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools(id) on delete cascade,
  teacher_user_id uuid not null references public.profiles(id) on delete cascade,
  class_name      text not null,
  subject         text not null,
  created_at      timestamptz not null default now(),
  unique (school_id, teacher_user_id, class_name, subject)
);

create index if not exists idx_teacher_assignments_school on public.teacher_assignments(school_id);
create index if not exists idx_teacher_assignments_teacher on public.teacher_assignments(teacher_user_id);

-- ---------------------------------------------------------------------
-- 3. Verrouillage : notes envoyées au directeur
-- ---------------------------------------------------------------------
create table if not exists public.grade_submissions (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools(id) on delete cascade,
  class_name    text not null,
  subject       text not null,
  period        text not null,
  submitted_by  uuid references public.profiles(id),
  submitted_at  timestamptz not null default now(),
  unique (school_id, class_name, subject, period)
);

create index if not exists idx_grade_submissions_school on public.grade_submissions(school_id);

-- ---------------------------------------------------------------------
-- 4. Fonction : l'appelant a-t-il le droit de créer/modifier/supprimer
--    CETTE note précise (classe + matière + période) ?
-- ---------------------------------------------------------------------
create or replace function public.can_edit_grade(p_school_id uuid, p_class_name text, p_subject text, p_period text)
returns boolean
language sql stable security definer set search_path = public as $$
  select
    case
      when public.is_platform_admin() then true
      when public.current_role() = 'admin' and p_school_id = public.current_school_id() then true
      when public.current_role() = 'teacher' and p_school_id = public.current_school_id() then
        exists (
          select 1 from public.teacher_assignments ta
          where ta.school_id = p_school_id
            and ta.teacher_user_id = auth.uid()
            and ta.class_name = p_class_name
            and ta.subject = p_subject
        )
        and not exists (
          select 1 from public.grade_submissions gs
          where gs.school_id = p_school_id
            and gs.class_name = p_class_name
            and gs.subject = p_subject
            and gs.period = p_period
        )
      else false
    end;
$$;

-- ---------------------------------------------------------------------
-- 5. RLS : teacher_assignments (le directeur gère, tout le monde de
--    l'établissement peut consulter)
-- ---------------------------------------------------------------------
alter table public.teacher_assignments enable row level security;

drop policy if exists "teacher_assignments_select" on public.teacher_assignments;
create policy "teacher_assignments_select" on public.teacher_assignments for select
  using ( school_id = public.current_school_id() or public.is_platform_admin() );

drop policy if exists "teacher_assignments_admin_insert" on public.teacher_assignments;
create policy "teacher_assignments_admin_insert" on public.teacher_assignments for insert
  with check ( school_id = public.current_school_id() and public.current_role() = 'admin' );

drop policy if exists "teacher_assignments_admin_update" on public.teacher_assignments;
create policy "teacher_assignments_admin_update" on public.teacher_assignments for update
  using ( school_id = public.current_school_id() and public.current_role() = 'admin' )
  with check ( school_id = public.current_school_id() and public.current_role() = 'admin' );

drop policy if exists "teacher_assignments_admin_delete" on public.teacher_assignments;
create policy "teacher_assignments_admin_delete" on public.teacher_assignments for delete
  using ( school_id = public.current_school_id() and public.current_role() = 'admin' );

-- ---------------------------------------------------------------------
-- 6. RLS : grade_submissions (un enseignant peut envoyer SES notes ;
--    seul le directeur peut "réouvrir" — c.-à-d. supprimer le verrou)
-- ---------------------------------------------------------------------
alter table public.grade_submissions enable row level security;

drop policy if exists "grade_submissions_select" on public.grade_submissions;
create policy "grade_submissions_select" on public.grade_submissions for select
  using ( school_id = public.current_school_id() or public.is_platform_admin() );

drop policy if exists "grade_submissions_insert" on public.grade_submissions;
create policy "grade_submissions_insert" on public.grade_submissions for insert
  with check (
    school_id = public.current_school_id()
    and (
      public.current_role() = 'admin'
      or exists (
        select 1 from public.teacher_assignments ta
        where ta.school_id = grade_submissions.school_id
          and ta.teacher_user_id = auth.uid()
          and ta.class_name = grade_submissions.class_name
          and ta.subject = grade_submissions.subject
      )
    )
  );

drop policy if exists "grade_submissions_admin_delete" on public.grade_submissions;
create policy "grade_submissions_admin_delete" on public.grade_submissions for delete
  using ( school_id = public.current_school_id() and public.current_role() = 'admin' );

-- ---------------------------------------------------------------------
-- 7. RLS : grades — remplace l'ancienne policy unique "grades_all" par
--    des policies séparées qui appliquent can_edit_grade().
-- ---------------------------------------------------------------------
drop policy if exists "grades_all" on public.grades;

drop policy if exists "grades_select" on public.grades;
create policy "grades_select" on public.grades for select
  using ( school_id = public.current_school_id() or public.is_platform_admin() );

drop policy if exists "grades_insert" on public.grades;
create policy "grades_insert" on public.grades for insert
  with check ( public.can_edit_grade(school_id, class_name, subject, period) );

drop policy if exists "grades_update" on public.grades;
create policy "grades_update" on public.grades for update
  using ( public.can_edit_grade(school_id, class_name, subject, period) )
  with check ( public.can_edit_grade(school_id, class_name, subject, period) );

drop policy if exists "grades_delete" on public.grades;
create policy "grades_delete" on public.grades for delete
  using ( public.can_edit_grade(school_id, class_name, subject, period) );

-- =========================================================================
-- Une fois exécuté, mettez à jour sur GitHub : index.html,
-- js/modules/grades.js, js/modules/users.js, js/modules/bulletins.js,
-- js/state.js, et redéployez la fonction Edge "invite-user" (nouvelle
-- version, elle gère maintenant les affectations classe+matière).
-- =========================================================================
