// ==========================================================================
// Utilisateurs & rôles de l'établissement
// ==========================================================================
import { getSupabase } from "../supabaseClient.js";
import { state } from "../state.js";
import { escapeHtml } from "../ui.js";

const el = (id) => document.getElementById(id);

const roleLabels = {
  platform_admin: "Super Admin",
  admin: "Direction",
  secretary: "Secrétaire",
  accountant: "Comptable",
  teacher: "Enseignant",
  parent: "Parent",
  student: "Élève",
};

export async function refresh() {
  const sb = getSupabase();
  const { data, error } = await sb.from("profiles").select("*").eq("school_id", state.school?.id).order("created_at");
  if (error) {
    el("usersBody").innerHTML = `<tr><td colspan="4" class="empty">${escapeHtml(error.message)}</td></tr>`;
    return;
  }
  el("usersBody").innerHTML =
    (data || [])
      .map(
        (u) => `<tr>
      <td><b>${escapeHtml(u.full_name || "—")}</b></td>
      <td>${escapeHtml(u.email || "—")}</td>
      <td><span class="badge blue">${escapeHtml(roleLabels[u.role] || u.role)}</span></td>
      <td><span class="badge green">${escapeHtml(u.status || "Actif")}</span></td>
    </tr>`
      )
      .join("") || `<tr><td colspan="4" class="empty">Aucun utilisateur.</td></tr>`;
}

export function mount() {
  // La création d'utilisateurs additionnels (secrétaire, comptable, enseignant…)
  // se fait via Supabase Auth (invitation par e-mail) ou l'API admin côté
  // serveur — jamais avec la clé anon exposée au navigateur.
}
