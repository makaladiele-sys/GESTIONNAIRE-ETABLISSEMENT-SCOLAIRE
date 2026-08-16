// ==========================================================================
// Élèves : liste, ajout, modification, suppression, import/export Excel.
// ==========================================================================
import { listRows, insertRow, updateRow, deleteRow, state } from "../state.js";
import { toast, openModal, closeModal, escapeHtml } from "../ui.js";

const el = (id) => document.getElementById(id);
let editingId = null;

function classOptions() {
  const classes = state.cache.classes || [];
  const names = classes.length ? classes.map((c) => c.name) : ["CI", "CP", "CE1", "CE2", "CM1", "CM2", "6ème A", "5ème A", "4ème A", "3ème A", "Seconde A", "Première A", "Terminale A"];
  return names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
}

export async function refresh() {
  if (!state.cache.classes) await listRows("classes");
  const students = await listRows("students", { orderBy: "name", ascending: true });
  populateClassFilter();
  renderTable(students);
}

function populateClassFilter() {
  const sel = el("classFilter");
  if (!sel) return;
  const classes = [...new Set((state.cache.students || []).map((s) => s.class_name).filter(Boolean))];
  const current = sel.value;
  sel.innerHTML = `<option value="">Toutes les classes</option>` + classes.map((c) => `<option>${escapeHtml(c)}</option>`).join("");
  if (classes.includes(current)) sel.value = current;
}

function renderTable(students) {
  const q = (el("studentSearch")?.value || "").toLowerCase();
  const cls = el("classFilter")?.value || "";
  const rows = (students || state.cache.students || []).filter(
    (s) =>
      (s.name + " " + (s.matricule || "") + " " + (s.parent_name || "") + " " + (s.class_name || "")).toLowerCase().includes(q) &&
      (!cls || s.class_name === cls)
  );
  el("studentsBody").innerHTML =
    rows
      .map(
        (s) => `<tr>
      <td><span class="id-badge">${escapeHtml(s.matricule || "—")}</span></td>
      <td>👤 ${escapeHtml(s.name)}</td>
      <td>${escapeHtml(s.class_name || "—")}</td>
      <td>${escapeHtml(s.parent_name || "—")}</td>
      <td>${escapeHtml(s.phone || "—")}</td>
      <td><span class="badge ${s.status === "Actif" ? "green" : "orange"}">${escapeHtml(s.status)}</span></td>
      <td>
        <button class="btn btn-light btn-sm" data-edit="${s.id}">✏️</button>
        <button class="btn btn-danger btn-sm" data-del="${s.id}">🗑️</button>
      </td>
    </tr>`
      )
      .join("") || `<tr><td colspan="7" class="empty">Aucun élève. Ajoutez-en un ou importez un fichier Excel.</td></tr>`;
}

function resetForm() {
  editingId = null;
  el("studentForm")?.reset();
  el("studentModalTitle") && (el("studentModalTitle").textContent = "Nouvel élève");
}

function generateMatricule() {
  const existing = new Set((state.cache.students || []).map((s) => s.matricule));
  let n = (state.cache.students || []).length + 1;
  let candidate = "ELV-" + String(n).padStart(4, "0");
  while (existing.has(candidate)) {
    n++;
    candidate = "ELV-" + String(n).padStart(4, "0");
  }
  return candidate;
}

function fillForm(s) {
  editingId = s.id;
  el("studentModalTitle") && (el("studentModalTitle").textContent = "Modifier l'élève");
  el("fStudentName").value = s.name || "";
  el("fStudentMat").value = s.matricule || "";
  el("fStudentClass").value = s.class_name || "";
  el("fStudentParent").value = s.parent_name || "";
  el("fStudentPhone").value = s.phone || "";
}

export function mount() {
  el("fStudentClass") && (el("fStudentClass").innerHTML = classOptions());
  el("studentSearch")?.addEventListener("input", () => renderTable());
  el("classFilter")?.addEventListener("change", () => renderTable());

  el("openAddStudent")?.addEventListener("click", () => {
    resetForm();
    el("fStudentClass") && (el("fStudentClass").innerHTML = classOptions());
    el("fStudentMat") && (el("fStudentMat").value = generateMatricule());
    openModal("studentModal");
  });

  el("studentsBody")?.addEventListener("click", async (e) => {
    const editId = e.target.closest("[data-edit]")?.dataset.edit;
    const delId = e.target.closest("[data-del]")?.dataset.del;
    if (editId) {
      const s = (state.cache.students || []).find((x) => x.id === editId);
      if (s) {
        el("fStudentClass") && (el("fStudentClass").innerHTML = classOptions());
        fillForm(s);
        openModal("studentModal");
      }
    }
    if (delId) {
      if (!confirm("Supprimer cet élève ?")) return;
      await deleteRow("students", delId);
      toast("Élève supprimé");
      await refresh();
    }
  });

  el("studentForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      name: el("fStudentName").value.trim(),
      matricule: el("fStudentMat").value.trim() || undefined,
      class_name: el("fStudentClass").value,
      parent_name: el("fStudentParent").value.trim(),
      phone: el("fStudentPhone").value.trim(),
      status: "Actif",
    };
    try {
      if (editingId) {
        await updateRow("students", editingId, payload);
        toast("Élève mis à jour");
      } else {
        if (!payload.matricule) payload.matricule = "ELV-" + String(Date.now()).slice(-6);
        await insertRow("students", payload);
        toast("Élève enregistré");
      }
      closeModal("studentModal");
      resetForm();
      await refresh();
    } catch (err) {
      toast("Erreur : " + err.message);
    }
  });

  el("exportStudentsBtn")?.addEventListener("click", () => exportExcel());
  el("importStudentsInput")?.addEventListener("change", (e) => importExcel(e.target.files[0]));
}

function exportExcel() {
  const rows = [
    ["Matricule", "Élève", "Classe", "Parent", "Téléphone", "Statut"],
    ...(state.cache.students || []).map((s) => [s.matricule, s.name, s.class_name, s.parent_name, s.phone, s.status]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Élèves");
  XLSX.writeFile(wb, "eleves.xlsx");
  toast("Export Excel téléchargé");
}

function importExcel(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const wb = XLSX.read(e.target.result, { type: "array" });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
    let count = 0;
    for (const r of rows) {
      const name = r["Élève"] || r["Eleve"] || r["Nom et prénom"] || r["Nom"];
      if (!name) continue;
      try {
        await insertRow("students", {
          matricule: String(r["Matricule"] || "ELV-" + String(Date.now() + count).slice(-6)),
          name: String(name),
          class_name: String(r["Classe"] || ""),
          parent_name: String(r["Parent"] || r["Tuteur"] || ""),
          phone: String(r["Téléphone"] || r["Telephone"] || ""),
          status: "Actif",
        });
        count++;
      } catch (_) {}
    }
    toast(count + " élève(s) importé(s)");
    await refresh();
  };
  reader.readAsArrayBuffer(file);
}
