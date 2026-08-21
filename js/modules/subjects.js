// ==========================================================================
// Catalogue des matières
// ==========================================================================
import { listRows, insertRow, updateRow, deleteRow, state } from "../state.js";
import { toast, openModal, closeModal, escapeHtml } from "../ui.js";
const el = (id) => document.getElementById(id);
let editingId = null;
export async function refresh() {
  const subjects = await listRows("subjects", { orderBy: "name", ascending: true });
  renderTable(subjects);
}
function renderTable(subjects) {
  const rows = subjects || state.cache.subjects || [];
  el("subjectsBody").innerHTML =
    rows
      .map(
        (s) => `<tr>
      <td><span class="id-badge">${escapeHtml(s.code || "—")}</span></td>
      <td><b>${escapeHtml(s.name)}</b></td>
      <td>${escapeHtml(s.cycle || "—")}</td>
      <td>${s.coefficient ?? "—"}</td>
      <td>${escapeHtml(s.weekly_hours || "—")}</td>
      <td>${escapeHtml(s.teacher_name || "—")}</td>
      <td>
        <button class="btn btn-light btn-sm" data-edit="${s.id}">✏️</button>
        <button class="btn btn-danger btn-sm" data-del="${s.id}">🗑️</button>
      </td>
    </tr>`
      )
      .join("") || `<tr><td colspan="7" class="empty">Aucune matière. Ajoutez votre catalogue pédagogique.</td></tr>`;
}
function resetForm() {
  editingId = null;
  el("subjectForm")?.reset();
  el("subjectModalTitle") && (el("subjectModalTitle").textContent = "Nouvelle matière");
}
function fillForm(s) {
  editingId = s.id;
  el("subjectModalTitle") && (el("subjectModalTitle").textContent = "Modifier la matière");
  el("fSubjectCode").value = s.code || "";
  el("fSubjectName").value = s.name || "";
  el("fSubjectCycle").value = s.cycle || "";
  el("fSubjectCoef").value = s.coefficient ?? 1;
  el("fSubjectHours").value = s.weekly_hours || "";
  el("fSubjectTeacher").value = s.teacher_name || "";
}

// Détecte un doublon probable : même nom (et même cycle si renseigné) déjà
// présent dans le catalogue, hors de la matière en cours de modification.
function findDuplicate(name, cycle) {
  const normalizedName = name.trim().toLowerCase();
  const normalizedCycle = (cycle || "").trim().toLowerCase();
  return (state.cache.subjects || []).find((s) => {
    if (s.id === editingId) return false;
    const sameName = (s.name || "").trim().toLowerCase() === normalizedName;
    const sameCycle = !normalizedCycle || (s.cycle || "").trim().toLowerCase() === normalizedCycle;
    return sameName && sameCycle;
  });
}

export function mount() {
  el("openAddSubject")?.addEventListener("click", () => {
    resetForm();
    openModal("subjectModal");
  });
  el("subjectsBody")?.addEventListener("click", async (e) => {
    const editId = e.target.closest("[data-edit]")?.dataset.edit;
    const delId = e.target.closest("[data-del]")?.dataset.del;
    if (editId) {
      const s = (state.cache.subjects || []).find((x) => x.id === editId);
      if (s) {
        fillForm(s);
        openModal("subjectModal");
      }
    }
    if (delId) {
      if (!confirm("Supprimer cette matière ?")) return;
      await deleteRow("subjects", delId);
      toast("Matière supprimée");
      await refresh();
    }
  });
  el("subjectForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      code: el("fSubjectCode").value.trim(),
      name: el("fSubjectName").value.trim(),
      cycle: el("fSubjectCycle").value.trim(),
      coefficient: Number(el("fSubjectCoef").value) || 1,
      weekly_hours: el("fSubjectHours").value.trim(),
      teacher_name: el("fSubjectTeacher").value.trim(),
    };

    const duplicate = findDuplicate(payload.name, payload.cycle);
    if (duplicate) {
      const proceed = confirm(
        `"${payload.name}"${payload.cycle ? " (" + payload.cycle + ")" : ""} existe déjà dans le catalogue (code ${duplicate.code || "—"}).\n\nAjouter quand même un doublon ?`
      );
      if (!proceed) return;
    }

    try {
      if (editingId) {
        await updateRow("subjects", editingId, payload);
        toast("Matière mise à jour");
      } else {
        await insertRow("subjects", payload);
        toast("Matière ajoutée");
      }
      closeModal("subjectModal");
      resetForm();
      await refresh();
    } catch (err) {
      toast("Erreur : " + err.message);
    }
  });
}
