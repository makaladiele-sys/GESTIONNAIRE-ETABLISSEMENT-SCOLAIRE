-- =========================================================================
-- GESTION SCOLAIRE SUITE — Schéma Supabase (multi-établissements / SaaS)
-- =========================================================================
-- À exécuter dans Supabase : Dashboard > SQL Editor > New query > Run.
-- Ce script est idempotent (peut être relancé sans casser une base existante).
-- =========================================================================

-- ---------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. Types énumérés
-- ---------------------------------------------------------------------
do $$ begin
  create type school_status as enum ('pending','active','suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type user_role as enum (
    'platform_admin',   -- vous : super admin de la plateforme SaaS
    'admin',            -- direction de l'établissement
    'secretary',
    'accountant',
    'teacher',
    'parent',
    'student'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 2. Établissements (tenants)
-- ---------------------------------------------------------------------
create table if not exists public.schools (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  email                 text,
  phone                 text,
  address               text,
  currency              text default 'FCFA',
  timezone              text default 'Africa/Dakar',
  current_academic_year text default '2026-2027',
  status                school_status not null default 'pending',
  created_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. Profils utilisateurs (1 profil = 1 utilisateur Supabase Auth)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  school_id  uuid references public.schools(id) on delete cascade,
  email      text,
  full_name  text,
  role       user_role not null default 'admin',
  status     text not null default 'active',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4. Données pédagogiques / administratives (toutes scopées par school_id)
-- ---------------------------------------------------------------------
create table if not exists public.classes (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools(id) on delete cascade,
  cycle         text not null,
  level         text not null,
  name          text not null,
  room          text,
  main_teacher  text,
  academic_year text,
  monthly_fee   numeric default 0,
  created_at    timestamptz not null default now()
);

create table if not exists public.subjects (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools(id) on delete cascade,
  code       text,
  name       text not null,
  cycle      text,
  coefficient numeric default 1,
  weekly_hours text,
  teacher_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.teachers (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete set null,
  matricule   text,
  name        text not null,
  subject     text,
  classes     text,
  contract    text default 'Titulaire',
  hourly_rate numeric,
  hours       numeric default 0,
  phone       text,
  email       text,
  status      text default 'Actif',
  created_at  timestamptz not null default now()
);

-- Affectations classe + matière par enseignant (contrôle fin de ce qu'un
-- enseignant a le droit de noter).
create table if not exists public.teacher_assignments (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools(id) on delete cascade,
  teacher_user_id uuid not null references public.profiles(id) on delete cascade,
  class_name      text not null,
  subject         text not null,
  created_at      timestamptz not null default now(),
  unique (school_id, teacher_user_id, class_name, subject)
);

create table if not exists public.parents (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools(id) on delete cascade,
  name       text not null,
  phone      text,
  email      text,
  children   text,
  balance    numeric default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.students (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  matricule   text,
  name        text not null,
  class_name  text,
  parent_name text,
  phone       text,
  status      text default 'Actif',
  enrolled_on date default current_date,
  created_at  timestamptz not null default now()
);

create table if not exists public.grades (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools(id) on delete cascade,
  student_name     text not null,
  class_name       text,
  subject          text not null,
  assessment_type  text default 'Devoir',
  note             numeric not null check (note >= 0 and note <= 20),
  coefficient      numeric default 1,
  period           text default 'Trimestre 1',
  created_at       timestamptz not null default now()
);

-- Verrouillage : une fois une classe+matière+période "envoyée", seul le
-- directeur (role admin) peut encore modifier les notes correspondantes.
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

create table if not exists public.attendance (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  class_name  text not null,
  date        date not null default current_date,
  present     integer default 0,
  absent      integer default 0,
  late        integer default 0,
  created_at  timestamptz not null default now()
);

-- Présences par élève (appel), remplace l'usage de la table "attendance"
-- ci-dessus dans l'interface : permet de lister précisément les absents.
create table if not exists public.attendance_records (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools(id) on delete cascade,
  student_name text not null,
  class_name   text not null,
  date         date not null default current_date,
  status       text not null default 'Présent' check (status in ('Présent','Absent','Retard')),
  created_at   timestamptz not null default now(),
  unique (school_id, student_name, date)
);

create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools(id) on delete cascade,
  student_name  text not null,
  reason        text default 'Scolarité',
  amount_due    numeric not null default 0,
  amount_paid   numeric not null default 0,
  method        text default 'Espèces',
  payment_date  date default current_date,
  status        text default 'Payé',
  created_at    timestamptz not null default now()
);

create table if not exists public.expenses (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  type        text default 'Dépense',
  category    text,
  reason      text,
  amount      numeric not null,
  op_date     date default current_date,
  created_by  text,
  created_at  timestamptz not null default now()
);

create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  channel     text default 'Notification interne',
  audience    text default 'Parents',
  body        text not null,
  status      text default 'Envoyé',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5. Index utiles
-- ---------------------------------------------------------------------
create index if not exists idx_profiles_school on public.profiles(school_id);
create index if not exists idx_students_school on public.students(school_id);
create index if not exists idx_parents_school on public.parents(school_id);
create index if not exists idx_teachers_school on public.teachers(school_id);
create index if not exists idx_teacher_assignments_school on public.teacher_assignments(school_id);
create index if not exists idx_teacher_assignments_teacher on public.teacher_assignments(teacher_user_id);
create index if not exists idx_grade_submissions_school on public.grade_submissions(school_id);
create index if not exists idx_classes_school on public.classes(school_id);
create index if not exists idx_subjects_school on public.subjects(school_id);
create index if not exists idx_grades_school on public.grades(school_id);
create index if not exists idx_attendance_school on public.attendance(school_id);
create index if not exists idx_attendance_records_school on public.attendance_records(school_id);
create index if not exists idx_attendance_records_date on public.attendance_records(date);
create index if not exists idx_payments_school on public.payments(school_id);
create index if not exists idx_expenses_school on public.expenses(school_id);
create index if not exists idx_messages_school on public.messages(school_id);

-- ---------------------------------------------------------------------
-- 6. Fonctions utilitaires (SECURITY DEFINER pour éviter la récursion RLS)
-- ---------------------------------------------------------------------
create or replace function public.current_school_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select school_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_role()
returns user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'platform_admin' from public.profiles where id = auth.uid()), false);
$$;

-- L'appelant a-t-il le droit de créer/modifier/supprimer CETTE note précise
-- (classe + matière + période) ? Utilisé par les policies de "grades".
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
-- 7. Trigger : création automatique du profil admin à l'inscription
--    Le mot de passe / e-mail est géré par Supabase Auth (auth.users).
--    school_id et full_name sont transmis via raw_user_meta_data au
--    moment du sb.auth.signUp({..., options:{data:{school_id, full_name}}}).
-- ---------------------------------------------------------------------
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

drop trigger if exists on_auth_user_created_school_admin on auth.users;
create trigger on_auth_user_created_school_admin
  after insert on auth.users
  for each row execute function public.handle_new_school_admin();

-- ---------------------------------------------------------------------
-- 8. Row Level Security
-- ---------------------------------------------------------------------
alter table public.schools    enable row level security;
alter table public.profiles   enable row level security;
alter table public.classes    enable row level security;
alter table public.subjects   enable row level security;
alter table public.teachers   enable row level security;
alter table public.teacher_assignments enable row level security;
alter table public.grade_submissions enable row level security;
alter table public.parents    enable row level security;
alter table public.students   enable row level security;
alter table public.grades     enable row level security;
alter table public.attendance enable row level security;
alter table public.attendance_records enable row level security;
alter table public.payments   enable row level security;
alter table public.expenses   enable row level security;
alter table public.messages   enable row level security;

-- schools -----------------------------------------------------------
drop policy if exists "schools_select" on public.schools;
create policy "schools_select" on public.schools for select
  using ( public.is_platform_admin() or id = public.current_school_id() );

drop policy if exists "schools_insert_public_signup" on public.schools;
create policy "schools_insert_public_signup" on public.schools for insert
  with check ( status = 'pending' );

drop policy if exists "schools_update" on public.schools;
create policy "schools_update" on public.schools for update
  using ( public.is_platform_admin() or id = public.current_school_id() )
  with check ( public.is_platform_admin() or id = public.current_school_id() );

-- profiles ------------------------------------------------------------
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select
  using ( id = auth.uid() or public.is_platform_admin() or school_id = public.current_school_id() );

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles for update
  using ( id = auth.uid() or public.is_platform_admin() )
  with check ( id = auth.uid() or public.is_platform_admin() );

-- Générique : une table par tenant, RLS identique pour chacune.
-- (répété explicitement pour rester lisible et éditable table par table)

drop policy if exists "classes_all" on public.classes;
create policy "classes_all" on public.classes for all
  using ( school_id = public.current_school_id() or public.is_platform_admin() )
  with check ( school_id = public.current_school_id() );

drop policy if exists "subjects_all" on public.subjects;
create policy "subjects_all" on public.subjects for all
  using ( school_id = public.current_school_id() or public.is_platform_admin() )
  with check ( school_id = public.current_school_id() );

drop policy if exists "teachers_all" on public.teachers;
create policy "teachers_all" on public.teachers for all
  using ( school_id = public.current_school_id() or public.is_platform_admin() )
  with check ( school_id = public.current_school_id() );

drop policy if exists "parents_all" on public.parents;
create policy "parents_all" on public.parents for all
  using ( school_id = public.current_school_id() or public.is_platform_admin() )
  with check ( school_id = public.current_school_id() );

drop policy if exists "students_all" on public.students;
create policy "students_all" on public.students for all
  using ( school_id = public.current_school_id() or public.is_platform_admin() )
  with check ( school_id = public.current_school_id() );

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

drop policy if exists "attendance_all" on public.attendance;
create policy "attendance_all" on public.attendance for all
  using ( school_id = public.current_school_id() or public.is_platform_admin() )
  with check ( school_id = public.current_school_id() );

drop policy if exists "attendance_records_all" on public.attendance_records;
create policy "attendance_records_all" on public.attendance_records for all
  using ( school_id = public.current_school_id() or public.is_platform_admin() )
  with check ( school_id = public.current_school_id() );

drop policy if exists "payments_all" on public.payments;
create policy "payments_all" on public.payments for all
  using ( school_id = public.current_school_id() or public.is_platform_admin() )
  with check ( school_id = public.current_school_id() );

drop policy if exists "expenses_all" on public.expenses;
create policy "expenses_all" on public.expenses for all
  using ( school_id = public.current_school_id() or public.is_platform_admin() )
  with check ( school_id = public.current_school_id() );

drop policy if exists "messages_all" on public.messages;
create policy "messages_all" on public.messages for all
  using ( school_id = public.current_school_id() or public.is_platform_admin() )
  with check ( school_id = public.current_school_id() );

-- ---------------------------------------------------------------------
-- 9. Devenir le tout premier super admin de la plateforme
-- ---------------------------------------------------------------------
-- 1) Créez votre compte depuis l'écran "Inscrire mon établissement" avec
--    n'importe quel nom d'établissement (il sera ignoré pour vous).
-- 2) Puis lancez, une seule fois, en remplaçant l'e-mail :
--
-- update public.profiles set role = 'platform_admin', school_id = null
-- where email = 'vous@example.com';
--
-- Vous verrez alors le menu "Super Admin" et pourrez activer les
-- établissements qui s'inscrivent.
-- =========================================================================
