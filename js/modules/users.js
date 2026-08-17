// ==========================================================================
// Utilisateurs & rôles de l'établissement
// ==========================================================================
import { getSupabase } from "../supabaseClient.js";
import { state, isPlatformAdmin, listRows } from "../state.js";
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

function classOptions() {
  const names = (state.cache.classes || []).map((c) => c.name);
  return names.map((n) => `<option>${escapeHtml(n)}</option>`).join("");
}

function subjectOptions() {
  const names = [...new Set((state.cache.subjects || []).map((s) => s.name))];
  return names.map((n) => `<option>${escapeHtml(n)}</option>`).join("");
}

function addAssignmentRow() {
  const wrap = el("inviteAssignmentsList");
  if (!wrap) return;
  const row = document.createElement("div");
  row.className = "form-grid assignment-row";
  row.style.gridTemplateColumns = "1fr 1fr auto";
  row.style.alignItems = "end";
  row.innerHTML = `
    <div class="form-group"><label>Classe</label><select class="form-control assignment-class">${classOptions()}</select></div>
    <div class="form-group"><label>Matière</label><select class="form-control assignment-subject">${subjectOptions()}</select></div>
    <button type="button" class="btn btn-danger btn-sm remove-assignment-row">🗑️</button>
  `;
  wrap.appendChild(row);
}

async function ensureClassAndSubjectCache() {
  if (!state.cache.classes) await listRows("classes");
  if (!state.cache.subjects) await listRows("subjects");
}

export function mount() {
  el("openInviteUser")?.addEventListener("click", async () => {
    el("inviteUserForm")?.reset();
    el("inviteAssignmentsList") && (el("inviteAssignmentsList").innerHTML = "");
    el("inviteAssignmentsWrap") && (el("inviteAssignmentsWrap").style.display = "none");
    await ensureClassAndSubjectCache();
    openModal("inviteUserModal");
  });

  el("fInviteRole")?.addEventListener("change", () => {
    const isTeacher = el("fInviteRole").value === "teacher";
    el("inviteAssignmentsWrap") && (el("inviteAssignmentsWrap").style.display = isTeacher ? "block" : "none");
    if (isTeacher && el("inviteAssignmentsList") && !el("inviteAssignmentsList").children.length) {
      addAssignmentRow();
    }
  });

  el("addAssignmentRow")?.addEventListener("click", addAssignmentRow);

  el("inviteAssignmentsList")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".remove-assignment-row");
    if (btn) btn.closest(".assignment-row")?.remove();
  });

  el("inviteUserForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isPlatformAdmin()) {
      toast("Connectez-vous avec un compte établissement pour inviter des utilisateurs.");
      return;
    }
    const sb = getSupabase();
    const role = el("fInviteRole").value;
    const payload = {
      full_name: el("fInviteName").value.trim(),
      email: el("fInviteEmail").value.trim().toLowerCase(),
      role,
    };

    if (role === "teacher") {
      const rows = Array.from(document.querySelectorAll("#inviteAssignmentsList .assignment-row"));
      const assignments = rows
        .map((r) => ({
          class_name: r.querySelector(".assignment-class")?.value || "",
          subject: r.querySelector(".assignment-subject")?.value || "",
        }))
        .filter((a) => a.class_name && a.subject);
      if (!assignments.length) {
        toast("Ajoutez au moins une classe et une matière pour cet enseignant.");
        return;
      }
      payload.assignments = assignments;
    }

    const btn = e.target.querySelector("button[type=submit]") || e.submitter;
    if (btn) btn.disabled = true;
    try {
      const { data, error } = await sb.functions.invoke("invite-user", { body: payload });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast("Invitation envoyée à " + payload.email);
      closeModal("inviteUserModal");
      el("inviteUserForm").reset();
      el("inviteAssignmentsList") && (el("inviteAssignmentsList").innerHTML = "");
      el("inviteAssignmentsWrap") && (el("inviteAssignmentsWrap").style.display = "none");
      await refresh();
    } catch (err) {
      toast("Erreur : " + err.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}
