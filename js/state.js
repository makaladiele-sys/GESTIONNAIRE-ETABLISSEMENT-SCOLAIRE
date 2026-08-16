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

export async function loadProfileAndSchool(userId) {
  const sb = getSupabase();
  const { data: profile, error: pErr } = await sb
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (pErr || !profile) throw new Error("Profil introuvable pour cet utilisateur.");

  state.profile = profile;

  if (profile.school_id) {
    const { data: school, error: sErr } = await sb
      .from("schools")
      .select("*")
      .eq("id", profile.school_id)
      .single();
    if (sErr || !school) throw new Error("Établissement introuvable pour ce profil.");
    if (profile.role !== "platform_admin" && school.status !== "active") {
      throw new Error(
        "Votre établissement est en attente de validation par la plateforme. Vous serez averti dès l'activation."
      );
    }
    state.school = school;
  } else {
    state.school = null;
  }
  return { profile, school: state.school };
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
