-- =========================================================================
-- GESTION SCOLAIRE SUITE — Mise à jour : suivi du recouvrement
-- =========================================================================
-- À exécuter UNE FOIS dans Supabase SQL Editor. Ajoute un frais mensuel par
-- classe, utilisé pour calculer ce qui devrait être recouvré (nombre de
-- mois écoulés depuis l'inscription × frais de la classe) face à ce qui a
-- réellement été payé (paiements motif "Scolarité").
-- =========================================================================

alter table public.classes add column if not exists monthly_fee numeric default 0;

-- =========================================================================
-- Une fois exécuté, mettez à jour sur GitHub : index.html,
-- js/modules/classes.js, js/modules/collections.js (nouveau), js/app.js.
-- =========================================================================
