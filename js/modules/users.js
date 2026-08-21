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

// ==========================================================================
// Chargement des utilisateurs
// ==========================================================================
export async function refresh() {
  const sb = getSupabase();
  const schoolId = state.school?.id;

  // Empêche une requête avec school_id=undefined
  if (!schoolId) {
    console.warn("[Users] school_id indisponible :", state.school);

    const body = el("usersBody");

    if (body) {
      body.innerHTML =
        `<tr><td colspan="4" class="empty">Établissement non chargé.</td></tr>`;
    }

    return;
  }

  try {
    const { data, error } = await sb
      .from("profiles")
      .select("*")
      .eq("school_id", schoolId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const body = el("usersBody");

    if (!body) {
      console.error("[Users] Élément usersBody introuvable.");
      return;
    }

    body.innerHTML =
      (data || [])
        .map(
          (u) => `
            <tr>
              <td>
                <b>${escapeHtml(u.full_name || "—")}</b>
              </td>

              <td>
                ${escapeHtml(u.email || "—")}
              </td>

              <td>
                <span class="badge blue">
                  ${escapeHtml(roleLabels[u.role] || u.role || "—")}
                </span>
              </td>

              <td>
                <span class="badge green">
                  ${escapeHtml(u.status || "Actif")}
                </span>
              </td>
            </tr>
          `
        )
        .join("") ||
      `<tr><td colspan="4" class="empty">Aucun utilisateur.</td></tr>`;

  } catch (err) {
    console.error("[Users] Erreur chargement profils :", err);

    const body = el("usersBody");

    if (body) {
      body.innerHTML =
        `<tr><td colspan="4" class="empty">Erreur : ${escapeHtml(err.message)}</td></tr>`;
    }
  }
}

// ==========================================================================
// Options des classes
// ==========================================================================
function classOptions() {
  const names = (state.cache.classes || []).map((c) => c.name);

  return names
    .map((n) => `<option>${escapeHtml(n)}</option>`)
    .join("");
}

// ==========================================================================
// Options des matières
// ==========================================================================
function subjectOptions() {
  const names = [
    ...new Set((state.cache.subjects || []).map((s) => s.name))
  ];

  return names
    .map((n) => `<option>${escapeHtml(n)}</option>`)
    .join("");
}

// ==========================================================================
// Ajouter une ligne classe + matière
// ==========================================================================
function addAssignmentRow() {
  const wrap = el("inviteAssignmentsList");

  if (!wrap) return;

  const row = document.createElement("div");

  row.className = "form-grid assignment-row";
  row.style.gridTemplateColumns = "1fr 1fr auto";
  row.style.alignItems = "end";

  row.innerHTML = `
    <div class="form-group">
      <label>Classe</label>
      <select class="form-control assignment-class">
        ${classOptions()}
      </select>
    </div>

    <div class="form-group">
      <label>Matière</label>
      <select class="form-control assignment-subject">
        ${subjectOptions()}
      </select>
    </div>

    <button
      type="button"
      class="btn btn-danger btn-sm remove-assignment-row"
    >
      🗑️
    </button>
  `;

  wrap.appendChild(row);
}

// ==========================================================================
// Charger le cache classes / matières
// ==========================================================================
async function ensureClassAndSubjectCache() {
  if (!state.cache.classes) {
    await listRows("classes");
  }

  if (!state.cache.subjects) {
    await listRows("subjects");
  }
}

// ==========================================================================
// Initialisation du module
// ==========================================================================
export function mount() {

  // ------------------------------------------------------------------------
  // Ouvrir la fenêtre d'invitation
  // ------------------------------------------------------------------------
  el("openInviteUser")?.addEventListener("click", async () => {

    el("inviteUserForm")?.reset();

    if (el("inviteAssignmentsList")) {
      el("inviteAssignmentsList").innerHTML = "";
    }

    if (el("inviteAssignmentsWrap")) {
      el("inviteAssignmentsWrap").style.display = "none";
    }

    await ensureClassAndSubjectCache();

    openModal("inviteUserModal");
  });

  // ------------------------------------------------------------------------
  // Changement de rôle
  // ------------------------------------------------------------------------
  el("fInviteRole")?.addEventListener("change", () => {

    const isTeacher = el("fInviteRole").value === "teacher";

    if (el("inviteAssignmentsWrap")) {
      el("inviteAssignmentsWrap").style.display =
        isTeacher ? "block" : "none";
    }

    if (
      isTeacher &&
      el("inviteAssignmentsList") &&
      !el("inviteAssignmentsList").children.length
    ) {
      addAssignmentRow();
    }
  });

  // ------------------------------------------------------------------------
  // Ajouter une affectation
  // ------------------------------------------------------------------------
  el("addAssignmentRow")?.addEventListener(
    "click",
    addAssignmentRow
  );

  // ------------------------------------------------------------------------
  // Supprimer une affectation
  // ------------------------------------------------------------------------
  el("inviteAssignmentsList")?.addEventListener("click", (e) => {

    const btn = e.target.closest(".remove-assignment-row");

    if (btn) {
      btn.closest(".assignment-row")?.remove();
    }
  });

  // ------------------------------------------------------------------------
  // Formulaire d'invitation
  // ------------------------------------------------------------------------
  el("inviteUserForm")?.addEventListener("submit", async (e) => {

    e.preventDefault();

    if (isPlatformAdmin()) {
      toast(
        "Connectez-vous avec un compte établissement pour inviter des utilisateurs."
      );
      return;
    }

    const sb = getSupabase();

    const role = el("fInviteRole").value;

    const payload = {
      full_name: el("fInviteName").value.trim(),
      email: el("fInviteEmail").value.trim().toLowerCase(),
      role,
    };

    // ----------------------------------------------------------------------
    // Affectations enseignant
    // ----------------------------------------------------------------------
    if (role === "teacher") {

      const rows = Array.from(
        document.querySelectorAll(
          "#inviteAssignmentsList .assignment-row"
        )
      );

      const assignments = rows
        .map((r) => ({
          class_name:
            r.querySelector(".assignment-class")?.value || "",

          subject:
            r.querySelector(".assignment-subject")?.value || "",
        }))
        .filter(
          (a) => a.class_name && a.subject
        );

      if (!assignments.length) {
        toast(
          "Ajoutez au moins une classe et une matière pour cet enseignant."
        );
        return;
      }

      payload.assignments = assignments;
    }

    const btn =
      e.target.querySelector("button[type=submit]") ||
      e.submitter;

    if (btn) {
      btn.disabled = true;
    }

    try {

      const { data, error } =
        await sb.functions.invoke("invite-user", {
          body: payload,
        });

      if (error) {
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      toast(
        "Invitation envoyée à " + payload.email
      );

      closeModal("inviteUserModal");

      el("inviteUserForm").reset();

      if (el("inviteAssignmentsList")) {
        el("inviteAssignmentsList").innerHTML = "";
      }

      if (el("inviteAssignmentsWrap")) {
        el("inviteAssignmentsWrap").style.display = "none";
      }

      await refresh();

    } catch (err) {

      console.error(
        "[Users] Erreur invitation :",
        err
      );

      toast(
        "Erreur : " + err.message
      );

    } finally {

      if (btn) {
        btn.disabled = false;
      }
    }
  });
}
