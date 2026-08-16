// ==========================================================================
// Utilisateurs & rôles de l'établissement
// ==========================================================================
import { getSupabase } from "../supabaseClient.js";
import { state, isPlatformAdmin } from "../state.js";
import { escapeHtml, toast, openModal, closeModal } from "../ui.js";

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
  el("openInviteUser")?.addEventListener("click", () => {
    el("inviteUserForm")?.reset();
    openModal("inviteUserModal");
  });

  el("inviteUserForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isPlatformAdmin()) {
      toast("Connectez-vous avec un compte établissement pour inviter des utilisateurs.");
      return;
    }
    const sb = getSupabase();
    const payload = {
      full_name: el("fInviteName").value.trim(),
      email: el("fInviteEmail").value.trim().toLowerCase(),
      role: el("fInviteRole").value,
    };
    const btn = e.target.querySelector("button[type=submit]") || e.submitter;
    if (btn) btn.disabled = true;
    try {
      const { data, error } = await sb.functions.invoke("invite-user", { body: payload });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast("Invitation envoyée à " + payload.email);
      closeModal("inviteUserModal");
      el("inviteUserForm").reset();
      await refresh();
    } catch (err) {
      toast("Erreur : " + err.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}
