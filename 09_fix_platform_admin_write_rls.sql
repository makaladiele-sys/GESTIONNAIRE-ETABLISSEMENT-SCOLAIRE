-- =========================================================================
-- GESTION SCOLAIRE SUITE — Correction RLS : le SuperAdmin ne pouvait pas
-- écrire (seulement lire) dans classes / subjects / teachers / parents /
-- students / attendance / attendance_records / payments / expenses.
-- =========================================================================
-- À exécuter UNE FOIS dans Supabase SQL Editor.
--
-- Bug : ces tables autorisaient le SuperAdmin à LIRE n'importe quelle école
-- (using ... or is_platform_admin()) mais leur "with check" (utilisé pour
-- INSERT/UPDATE) exigeait toujours school_id = current_school_id(), sans
-- exception pour is_platform_admin(). Un SuperAdmin (qui n'a pas de
-- school_id propre) recevait donc une erreur 403 "row-level security
-- policy" dès qu'il essayait d'enregistrer une modification.
-- =========================================================================

drop policy if exists "classes_all" on public.classes;
create policy "classes_all" on public.classes for all
  using ( school_id = public.current_school_id() or public.is_platform_admin() )
  with check ( school_id = public.current_school_id() or public.is_platform_admin() );

drop policy if exists "subjects_all" on public.subjects;
create policy "subjects_all" on public.subjects for all
  using ( school_id = public.current_school_id() or public.is_platform_admin() )
  with check ( school_id = public.current_school_id() or public.is_platform_admin() );

drop policy if exists "teachers_all" on public.teachers;
create policy "teachers_all" on public.teachers for all
  using ( school_id = public.current_school_id() or public.is_platform_admin() )
  with check ( school_id = public.current_school_id() or public.is_platform_admin() );

drop policy if exists "parents_all" on public.parents;
create policy "parents_all" on public.parents for all
  using ( school_id = public.current_school_id() or public.is_platform_admin() )
  with check ( school_id = public.current_school_id() or public.is_platform_admin() );

drop policy if exists "students_all" on public.students;
create policy "students_all" on public.students for all
  using ( school_id = public.current_school_id() or public.is_platform_admin() )
  with check ( school_id = public.current_school_id() or public.is_platform_admin() );

drop policy if exists "attendance_all" on public.attendance;
create policy "attendance_all" on public.attendance for all
  using ( school_id = public.current_school_id() or public.is_platform_admin() )
  with check ( school_id = public.current_school_id() or public.is_platform_admin() );

drop policy if exists "attendance_records_all" on public.attendance_records;
create policy "attendance_records_all" on public.attendance_records for all
  using ( school_id = public.current_school_id() or public.is_platform_admin() )
  with check ( school_id = public.current_school_id() or public.is_platform_admin() );

drop policy if exists "payments_all" on public.payments;
create policy "payments_all" on public.payments for all
  using ( school_id = public.current_school_id() or public.is_platform_admin() )
  with check ( school_id = public.current_school_id() or public.is_platform_admin() );

drop policy if exists "expenses_all" on public.expenses;
create policy "expenses_all" on public.expenses for all
  using ( school_id = public.current_school_id() or public.is_platform_admin() )
  with check ( school_id = public.current_school_id() or public.is_platform_admin() );
