-- =========================================================================
-- GESTION SCOLAIRE SUITE — Lien réel Paiement ↔ Élève (par ID, pas par nom)
-- =========================================================================
-- À exécuter UNE FOIS dans Supabase SQL Editor.
--
-- Problème corrigé : les paiements étaient rattachés aux élèves uniquement
-- par leur NOM (payments.student_name, texte libre). Si deux élèves
-- partagent le même nom (ex: deux "MOUSSA"), leurs paiements se mélangent
-- et les totaux "Attendu" vs "Encaissé" de Facturation & Paiements et de
-- Recouvrement deviennent incohérents.
--
-- Cette migration ajoute payments.student_id (lien réel, fiable) tout en
-- gardant payments.student_name pour l'affichage et les anciens reçus.
-- =========================================================================

alter table public.payments
  add column if not exists student_id uuid references public.students(id) on delete set null;

create index if not exists idx_payments_student_id on public.payments(student_id);

-- Rattache automatiquement les anciens paiements quand le nom ne correspond
-- qu'à UN SEUL élève (cas sans ambiguïté). Les cas ambigus (nom partagé par
-- plusieurs élèves) restent non rattachés — à corriger manuellement en
-- rouvrant/ré-enregistrant le paiement depuis l'application.
update public.payments p
set student_id = s.id
from (
  select name as student_name, school_id, (array_agg(id))[1] as id, count(*) as nb
  from public.students
  group by name, school_id
) s
where p.student_id is null
  and p.student_name = s.student_name
  and p.school_id = s.school_id
  and s.nb = 1;
