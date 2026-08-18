-- =========================================================================
-- GESTION SCOLAIRE SUITE — Mise à jour : présences par élève
-- =========================================================================
-- À exécuter UNE FOIS dans Supabase SQL Editor. Ajoute une table dédiée à
-- l'appel élève par élève (présent / absent / retard), pour pouvoir lister
-- les absents précisément, jour par jour et classe par classe.
--
-- L'ancienne table "attendance" (comptages globaux par classe) n'est pas
-- supprimée — elle n'est simplement plus utilisée par l'interface. Vous
-- pouvez la conserver sans risque, ou la supprimer plus tard si vous le
-- souhaitez (drop table if exists public.attendance;).
-- =========================================================================

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

create index if not exists idx_attendance_records_school on public.attendance_records(school_id);
create index if not exists idx_attendance_records_date   on public.attendance_records(date);

alter table public.attendance_records enable row level security;

drop policy if exists "attendance_records_all" on public.attendance_records;
create policy "attendance_records_all" on public.attendance_records for all
  using ( school_id = public.current_school_id() or public.is_platform_admin() )
  with check ( school_id = public.current_school_id() );

-- =========================================================================
-- Une fois exécuté, mettez à jour sur GitHub : index.html et
-- js/modules/attendance.js (et js/state.js, qui gagne un petit helper
-- upsertRows utilisé par le nouvel appel).
-- =========================================================================
