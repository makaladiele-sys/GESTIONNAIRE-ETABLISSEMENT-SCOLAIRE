// ==========================================================================
// État partagé de l'application + helpers CRUD génériques Supabase.
// Chaque enregistrement est automatiquement rattaché au school_id courant ;
// la sécurité réelle (isolation entre établissements) est assurée par les
// policies RLS de sql/schema.sql, pas par ce code client.
// ==========================================================================
import { getSupabase } from "./supabaseClient.js";

export const state = {
  session: null,
  user: null,
  profile: null,
  school: null,
  cache: {}, // { tableName: rows[] }
};

export function isPlatformAdmin() {
  return state.profile?.role === "platform_admin";
}

export function schoolId() {
  return state.profile?.school_id || null;
}

// Empêche les appels concurrents de loadProfileAndSchool() de déclencher
// plusieurs requêtes en parallèle avec des résultats incohérents.
let _loadingPromise = null;

export async function loadProfileAndSchool(userId) {
  if (_loadingPromise) return _loadingPromise;
  _loadingPromise = _loadProfileAndSchoolInner(userId).finally(() => {
    _loadingPromise = null;
  });
  return _loadingPromise;
}

async function _loadProfileAndSchoolInner(userId) {
  const sb = getSupabase();

  // Force la résolution/rehydratation complète de la session AVANT toute
  // requête dépendante de RLS. Sans ça, juste après une connexion, le
  // token peut ne pas encore être attaché aux requêtes REST, ce qui fait
  // que RLS voit une requête "anonyme" -> 0 ligne -> Supabase renvoie 406
  // avec .single(), alors que le profil existe bel et bien.
  await sb.auth.getSession();

  const profile = await _fetchProfileWithRetry(sb, userId);
  if (!profile) throw new Error("Profil introuvable pour cet utilisateur.");
  state.profile = profile;

  if (profile.school_id) {
    const { data: school, error: sErr } = await sb
      .from("schools")
      .select("*")
      .eq("id", profile.school_id)
      .maybeSingle();
    if (sErr || !school) throw new Error("Établissement introuvable pour ce profil.");
    if (profile.role !== "platform_admin" && school.status !== "active") {

  if (school.status === "suspended") {
    throw new Error(
      "Votre établissement a été suspendu par l'administrateur de la plateforme. Veuillez contacter la plateforme pour réactiver votre accès."
    );
  }

  throw new Error(
    "L'accès à votre établissement n'est pas actuellement disponible."
  );
}    state.school = school;
  } else {
    // Cas normal pour platform_admin : pas d'établissement rattaché.
    state.school = null;
  }

  return { profile, school: state.school };
}

// maybeSingle() ne lève pas d'erreur 406 sur 0 ligne, mais peut légitimement
// renvoyer null lors du tout premier instant post-connexion (RLS pas encore
// synchro). On retente donc 2-3 fois avec un petit délai avant de conclure
// à un vrai profil manquant.
async function _fetchProfileWithRetry(sb, userId, attempts = 3, delayMs = 300) {
  for (let i = 0; i < attempts; i++) {
    const { data: profile, error } = await sb
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (profile) return profile;
    if (error && error.code && error.code !== "PGRST116") {
      // Erreur réelle (réseau, RLS mal configurée, etc.) : pas la peine
      // de retenter, on remonte l'erreur telle quelle.
      throw error;
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

// ---- CRUD génériques --------------------------------------------------
export async function listRows(table, { orderBy = "created_at", ascending = false, filters = {} } = {}) {
  const sb = getSupabase();
  let q = sb.from(table).select("*").order(orderBy, { ascending });
  for (const [col, val] of Object.entries(filters)) q = q.eq(col, val);
  const { data, error } = await q;
  if (error) throw error;
  state.cache[table] = data || [];
  return state.cache[table];
}

export async function insertRow(table, row) {
  const sb = getSupabase();
  const payload = { ...row };
  if (!isPlatformAdmin() || row.school_id) payload.school_id = payload.school_id || schoolId();
  const { data, error } = await sb.from(table).insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateRow(table, id, patch) {
  const sb = getSupabase();
  const { data, error } = await sb.from(table).update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteRow(table, id) {
  const sb = getSupabase();
  const { error } = await sb.from(table).delete().eq("id", id);
  if (error) throw error;
  return true;
}

export async function upsertRows(table, rows, onConflict) {
  const sb = getSupabase();
  const sid = schoolId();
  const payload = rows.map((r) => ({ ...r, school_id: r.school_id || sid }));
  const { data, error } = await sb.from(table).upsert(payload, { onConflict }).select();
  if (error) throw error;
  return data;
}


// --------------------------------------------------------------------------
// Vérification périodique du statut de l'établissement
// --------------------------------------------------------------------------

let schoolStatusTimer = null;
let schoolStatusChecking = false;

export async function checkSchoolStatus() {
  // Le Super Admin n'est pas rattaché à un établissement.
  if (isPlatformAdmin()) return true;

  if (!state.user?.id || !state.profile?.school_id) return true;

  if (schoolStatusChecking) return true;

  schoolStatusChecking = true;

  try {
    const sb = getSupabase();

    const { data: school, error } = await sb
      .from("schools")
      .select("id, name, status")
      .eq("id", state.profile.school_id)
      .maybeSingle();

    if (error) {
      console.error("[Security] Vérification établissement :", error);
      return true;
    }

    if (!school) {
      await forceSchoolLogout(
        "Votre établissement n'existe plus sur la plateforme."
      );
      return false;
    }

    if (school.status !== "active") {
      const message =
        school.status === "suspended"
          ? "Votre établissement a été suspendu par l'administrateur de la plateforme. Veuillez contacter la plateforme."
          : "L'accès à votre établissement n'est pas actuellement disponible.";

      await forceSchoolLogout(message);
      return false;
    }

    state.school = {
      ...state.school,
      ...school,
    };

    return true;

  } catch (error) {
    console.error("[Security] Exception vérification statut :", error);
    return true;
  } finally {
    schoolStatusChecking = false;
  }
}

async function forceSchoolLogout(message) {
  const sb = getSupabase();

  state.school = null;

  try {
    await sb.auth.signOut();
  } catch (error) {
    console.error("[Security] Erreur déconnexion :", error);
  }

  const box = document.getElementById("authError");

  if (box) {
    box.textContent = message;
    box.classList.remove("ok");
    box.style.display = "block";
  }

  document.body.classList.add("auth-locked");

  const gate = document.getElementById("authGate");

  if (gate) {
    gate.style.display = "flex";
  }
}

export function startSchoolStatusMonitor() {
  stopSchoolStatusMonitor();

  // Vérification toutes les 30 secondes
  schoolStatusTimer = setInterval(() => {
    checkSchoolStatus();
  }, 30000);
}

export function stopSchoolStatusMonitor() {
  if (schoolStatusTimer) {
    clearInterval(schoolStatusTimer);
    schoolStatusTimer = null;
  }
}
