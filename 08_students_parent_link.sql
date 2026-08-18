-- =========================================================================
-- GESTION SCOLAIRE SUITE — Lien réel Parent ↔ Élève(s)
-- =========================================================================
-- À exécuter UNE FOIS dans Supabase SQL Editor.
--
-- Jusqu'ici, "Parents / Tuteurs" était une simple liste de contacts, sans
-- lien réel avec la table students (le champ "children" était du texte
-- libre). Cette migration ajoute un vrai lien : students.parent_id.
--
-- Depuis la fiche parent, on peut désormais sélectionner un ou plusieurs
-- élèves existants et renseigner/modifier le frais mensuel de chacun
-- directement depuis ce formulaire (le frais reste stocké sur
-- students.monthly_fee — seule source de vérité utilisée par
-- js/modules/feeCalc.js pour "Attendu", "Encaissé" et "En retard").
-- =========================================================================

alter table public.students
  add column if not exists parent_id uuid references public.parents(id) on delete set null;

create index if not exists idx_students_parent_id on public.students(parent_id);

comment on column public.students.parent_id is
  'Parent/tuteur lié (table parents). Renseigné depuis le formulaire "Modifier le parent".';

-- =========================================================================
-- Une fois exécuté, mettez à jour sur GitHub : index.html,
-- js/modules/parents.js.
-- =========================================================================
