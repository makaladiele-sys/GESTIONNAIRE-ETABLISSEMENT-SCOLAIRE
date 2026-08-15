// ==========================================================================
// Niveaux & Classes
// ==========================================================================
import { listRows, insertRow, updateRow, deleteRow, state } from "../state.js";
import { toast, openModal, closeModal, escapeHtml } from "../ui.js";

const el = (id) => document.getElementById(id);
let editingId = null;

export async function refresh() {
  const classes = await listRows("classes", { orderBy: "name", ascending: true });
  const students = state.cache.students || (await listRows("students"));
  renderTable(classes, students);
}

function countFor(className, students) {
  return students.filter((s) => s.class_name === className).length;
}

function renderTable(classes, students) {
  const cycle = el("classCycleFilter")?.value || "";
  const rows = (classes || state.cache.classes || []).filter((c) => !cycle || c.cycle === cycle);
  el("classesBody").innerHTML =
    rows
      .map((c) => {
        const effectif = countFor(c.name, students || state.cache.students || []);
        return `<tr>
        <td><span class="badge blue">${escapeHtml(c.cycle)}</span></td>
        <td>${escapeHtml(c.level)}</td>
        <td><b>${escapeHtml(c.name)}</b></td>
        <td>${effectif}</td>
        <td>${escapeHtml(c.room || "—")}</td>
        <td>${escapeHtml(c.main_teacher || "—")}</td>
        <td>
          <button class="btn btn-light btn-sm" data-edit="${c.id}">✏️</button>
          <button class="btn btn-danger btn-sm" data-del="${c.id}">🗑️</button>
        </td>
      </tr>`;
      })
      .join("") || `<tr><td colspan="7" class="empty">Aucune classe. Créez votre première classe.</td></tr>`;

  const stats = document.getElementById("classSummaryStats");
  if (stats) {
    const total = rows.length;
    const totalStudents = rows.reduce((a, c) => a + countFor(c.name, students || state.cache.students || []), 0);
    stats.innerHTML = `
      <div class="stat"><div><div class="label">Classes</div><div class="value">${total}</div></div><div class="stat-icon">📚</div></div>
      <div class="stat"><div><div class="label">Effectif total</div><div class="value">${totalStudents}</div></div><div class="stat-icon">👨‍🎓</div></div>`;
  }
}

function resetForm() {
  editingId = null;
  el("classForm")?.reset();
  el("classModalTitle") && (el("classModalTitle").textContent = "Nouvelle classe");
}
function fillForm(c) {
  editingId = c.id;
  el("classModalTitle") && (el("classModalTitle").textContent = "Modifier la classe");
  el("fClassCycle").value = c.cycle || "Primaire";
  el("fClassLevel").value = c.level || "";
  el("fClassName").value = c.name || "";
  el("fClassRoom").value = c.room || "";
  el("fClassTeacher").value = c.main_teacher || "";
}

export function mount() {
  el("classCycleFilter")?.addEventListener("change", () => renderTable());
  el("openAddClass")?.addEventListener("click", () => {
    resetForm();
    openModal("classModal");
  });

  el("classesBody")?.addEventListener("click", async (e) => {
    const editId = e.target.closest("[data-edit]")?.dataset.edit;
    const delId = e.target.closest("[data-del]")?.dataset.del;
    if (editId) {
      const c = (state.cache.classes || []).find((x) => x.id === editId);
      if (c) {
        fillForm(c);
        openModal("classModal");
      }
    }
    if (delId) {
      if (!confirm("Supprimer cette classe ?")) return;
      await deleteRow("classes", delId);
      toast("Classe supprimée");
      await refresh();
    }
  });

  el("classForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      cycle: el("fClassCycle").value,
      level: el("fClassLevel").value.trim(),
      name: el("fClassName").value.trim(),
      room: el("fClassRoom").value.trim(),
      main_teacher: el("fClassTeacher").value.trim(),
    };
    try {
      if (editingId) {
        await updateRow("classes", editingId, payload);
        toast("Classe mise à jour");
      } else {
        await insertRow("classes", payload);
        toast("Classe créée");
      }
      closeModal("classModal");
      resetForm();
      await refresh();
    } catch (err) {
      toast("Erreur : " + err.message);
    }
  });
}
