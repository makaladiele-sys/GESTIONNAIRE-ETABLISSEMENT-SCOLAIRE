-- =========================================================================
-- GESTION SCOLAIRE SUITE — Frais mensuel personnalisé par élève
-- =========================================================================
-- À exécuter UNE FOIS dans Supabase SQL Editor.
--
-- Jusqu'ici, le frais mensuel était défini uniquement au niveau de la classe
-- (classes.monthly_fee), identique pour tous les élèves d'une même classe.
-- Cette migration ajoute un frais mensuel propre à chaque élève :
--   - si students.monthly_fee est renseigné (> 0), il est utilisé,
--   - sinon, on retombe sur le frais de la classe (classes.monthly_fee),
-- afin de rester compatible avec les données existantes.
--
-- Ce frais par élève est utilisé pour calculer "Attendu", "Encaissé" et
-- "En retard" dans Recouvrement ET Facturation & Paiements (source unique
-- de vérité : js/modules/feeCalc.js).
-- =========================================================================

alter table public.students add column if not exists monthly_fee numeric;

comment on column public.students.monthly_fee is
  'Frais mensuel propre à cet élève. Si NULL, on utilise le frais de sa classe (classes.monthly_fee).';

-- =========================================================================
-- Une fois exécuté, mettez à jour sur GitHub : index.html,
-- js/modules/students.js, js/modules/feeCalc.js.
-- =========================================================================
