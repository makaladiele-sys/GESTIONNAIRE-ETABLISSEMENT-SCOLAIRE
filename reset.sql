-- =========================================================================
-- GESTION SCOLAIRE SUITE — Script de RESET (usage développement/tests)
-- =========================================================================
-- ⚠️ DANGER : ce script supprime DÉFINITIVEMENT toutes les données de
-- l'application (établissements, élèves, notes, paiements, comptes...).
-- Ne JAMAIS l'exécuter sur une base de production contenant de vraies
-- données. Il sert uniquement à repartir d'une base vide pendant les tests,
-- avant de relancer sql/schema.sql.
--
-- À exécuter dans Supabase : Dashboard > SQL Editor > New query > Run.
-- =========================================================================

-- ---------------------------------------------------------------------
-- 1. Supprimer le trigger d'inscription (doit être fait avant de
--    supprimer la fonction qu'il appelle)
-- ---------------------------------------------------------------------
drop trigger if exists on_auth_user_created_school_admin on auth.users;

-- ---------------------------------------------------------------------
-- 2. Supprimer les tables applicatives (ordre : enfants avant parents,
--    via CASCADE pour ne pas avoir à respecter l'ordre exact des FKs)
-- ---------------------------------------------------------------------
drop table if exists public.messages    cascade;
drop table if exists public.expenses    cascade;
drop table if exists public.payments    cascade;
drop table if exists public.attendance  cascade;
drop table if exists public.grades      cascade;
drop table if exists public.students    cascade;
drop table if exists public.parents     cascade;
drop table if exists public.teachers    cascade;
drop table if exists public.subjects    cascade;
drop table if exists public.classes     cascade;
drop table if exists public.profiles    cascade;
drop table if exists public.schools     cascade;

-- ---------------------------------------------------------------------
-- 3. Supprimer les fonctions
-- ---------------------------------------------------------------------
drop function if exists public.handle_new_school_admin() cascade;
drop function if exists public.current_school_id() cascade;
drop function if exists public.current_role() cascade;
drop function if exists public.is_platform_admin() cascade;

-- ---------------------------------------------------------------------
-- 4. Supprimer les types énumérés
-- ---------------------------------------------------------------------
drop type if exists user_role;
drop type if exists school_status;

-- ---------------------------------------------------------------------
-- 5. Nettoyer les comptes de test créés dans auth.users
-- ---------------------------------------------------------------------
-- Supabase ne permet pas de supprimer auth.users directement en SQL
-- standard depuis le SQL Editor (table gérée par le service Auth).
-- Pour repartir de zéro complètement, supprimez aussi les utilisateurs
-- de test manuellement dans : Authentication → Users → (sélectionner) →
-- Delete user. Sinon, une nouvelle inscription avec le même e-mail
-- échouera ("un utilisateur existe déjà avec cet e-mail").

-- =========================================================================
-- Une fois ce script exécuté, relancez sql/schema.sql en entier pour
-- recréer les tables, la sécurité RLS et le trigger d'inscription.
-- =========================================================================
