// ==========================================================================
// Enseignants & RH
// ==========================================================================
import { listRows, insertRow, updateRow, deleteRow, state } from "../state.js";
import { toast, openModal, closeModal, escapeHtml } from "../ui.js";

const el = (id) => document.getElementById(id);
let editingId = null;

export async function refresh() {
  const teachers = await listRows("teachers", { orderBy: "name", ascending: true });
  const totalHours = teachers.reduce((a, t) => a + Number(t.hours || 0), 0);
  el("statTeacherHours") && (el("statTeacherHours").textContent = totalHours + " h");
  renderTable(teachers);
}

function renderTable(teachers) {
  const rows = teachers || state.cache.teachers || [];
  el("teachersBody").innerHTML =
    rows
      .map(
        (t) => `<tr>
      <td><span class="id-badge">${escapeHtml(t.matricule || "—")}</span></td>
      <td><b>${escapeHtml(t.name)}</b></td>
      <td>${escapeHtml(t.subject || "—")}</td>
      <td>${escapeHtml(t.classes || "—")}</td>
      <td>${escapeHtml(t.contract || "—")}</td>
      <td>${Number(t.hours || 0)} h</td>
      <td><span class="badge ${t.status === "Actif" ? "green" : "orange"}">${escapeHtml(t.status || "Actif")}</span></td>
      <td>
        <button class="btn btn-light btn-sm" data-edit="${t.id}">✏️</button>
        <button class="btn btn-danger btn-sm" data-del="${t.id}">🗑️</button>
      </td>
    </tr>`
      )
      .join("") || `<tr><td colspan="8" class="empty">Aucun enseignant enregistré.</td></tr>`;
}

function resetForm() {
  editingId = null;
  el("teacherForm")?.reset();
  el("teacherModalTitle") && (el("teacherModalTitle").textContent = "Nouvel enseignant");
}
function fillForm(t) {
  editingId = t.id;
  el("teacherModalTitle") && (el("teacherModalTitle").textContent = "Modifier l'enseignant");
  el("fTeacherName").value = t.name || "";
  el("fTeacherSubject").value = t.subject || "";
  el("fTeacherContract").value = t.contract || "Titulaire";
  el("fTeacherClasses").value = t.classes || "";
  el("fTeacherHours").value = t.hours || 0;
  el("fTeacherRate").value = t.hourly_rate || "";
  el("fTeacherPhone").value = t.phone || "";
}

export function mount() {
  el("openAddTeacher")?.addEventListener("click", () => {
    resetForm();
    openModal("teacherModal");
  });

  el("teachersBody")?.addEventListener("click", async (e) => {
    const editId = e.target.closest("[data-edit]")?.dataset.edit;
    const delId = e.target.closest("[data-del]")?.dataset.del;
    if (editId) {
      const t = (state.cache.teachers || []).find((x) => x.id === editId);
      if (t) {
        fillForm(t);
        openModal("teacherModal");
      }
    }
    if (delId) {
      if (!confirm("Supprimer cet enseignant ?")) return;
      await deleteRow("teachers", delId);
      toast("Enseignant supprimé");
      await refresh();
    }
  });

  el("teacherForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      name: el("fTeacherName").value.trim(),
      subject: el("fTeacherSubject").value.trim(),
      contract: el("fTeacherContract").value,
      classes: el("fTeacherClasses").value.trim(),
      hours: Number(el("fTeacherHours").value) || 0,
      hourly_rate: Number(el("fTeacherRate").value) || null,
      phone: el("fTeacherPhone").value.trim(),
      status: "Actif",
    };
    try {
      if (editingId) {
        await updateRow("teachers", editingId, payload);
        toast("Enseignant mis à jour");
      } else {
        payload.matricule = "ENS-" + String(Date.now()).slice(-5);
        await insertRow("teachers", payload);
        toast("Enseignant enregistré");
      }
      closeModal("teacherModal");
      resetForm();
      await refresh();
    } catch (err) {
      toast("Erreur : " + err.message);
    }
  });
}
