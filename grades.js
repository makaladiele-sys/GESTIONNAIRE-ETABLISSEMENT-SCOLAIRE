// ==========================================================================
// Notes & Gradebook
// ==========================================================================
import { listRows, insertRow, deleteRow, state } from "../state.js";
import { toast, openModal, closeModal, escapeHtml } from "../ui.js";

const el = (id) => document.getElementById(id);

export async function refresh() {
  if (!state.cache.students) await listRows("students");
  const grades = await listRows("grades", { orderBy: "created_at", ascending: false });
  renderTable(grades);
}

function renderTable(grades) {
  const q = (el("gradeSearch")?.value || "").toLowerCase();
  const period = el("gradePeriod")?.value || "Toutes périodes";
  const rows = (grades || state.cache.grades || []).filter(
    (g) =>
      (g.student_name + " " + (g.class_name || "") + " " + g.subject).toLowerCase().includes(q) &&
      (period === "Toutes périodes" || g.period === period)
  );
  el("gradesBody").innerHTML =
    rows
      .map(
        (g) => `<tr>
      <td>${escapeHtml(g.student_name)}</td>
      <td>${escapeHtml(g.class_name || "—")}</td>
      <td>${escapeHtml(g.subject)}</td>
      <td>${escapeHtml(g.assessment_type)}</td>
      <td><b>${Number(g.note).toFixed(2)}/20</b></td>
      <td>${g.coefficient}</td>
      <td>${escapeHtml(g.period)}</td>
      <td><button class="btn btn-danger btn-sm" data-del="${g.id}">🗑️</button></td>
    </tr>`
      )
      .join("") || `<tr><td colspan="8" class="empty">Aucune note saisie pour ce filtre.</td></tr>`;
}

function studentOptions() {
  return (state.cache.students || []).map((s) => `<option value="${escapeHtml(s.name)}" data-class="${escapeHtml(s.class_name || "")}">${escapeHtml(s.name)}</option>`).join("");
}

export function mount() {
  el("gradeSearch")?.addEventListener("input", () => renderTable());
  el("gradePeriod")?.addEventListener("change", () => renderTable());

  el("openAddGrade")?.addEventListener("click", () => {
    el("fGradeStudent") && (el("fGradeStudent").innerHTML = studentOptions());
    el("gradeForm")?.reset();
    openModal("gradeModal");
  });

  el("gradesBody")?.addEventListener("click", async (e) => {
    const delId = e.target.closest("[data-del]")?.dataset.del;
    if (delId) {
      if (!confirm("Supprimer cette note ?")) return;
      await deleteRow("grades", delId);
      toast("Note supprimée");
      await refresh();
    }
  });

  el("gradeForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const studentSelect = el("fGradeStudent");
    const studentName = studentSelect.value;
    const className = studentSelect.selectedOptions[0]?.dataset.class || "";
    const payload = {
      student_name: studentName,
      class_name: className,
      subject: el("fGradeSubject").value,
      assessment_type: el("fGradeType").value,
      note: Number(el("fGradeNote").value),
      coefficient: Number(el("fGradeCoef").value) || 1,
      period: el("fGradePeriod").value,
    };
    try {
      await insertRow("grades", payload);
      toast("Note enregistrée");
      closeModal("gradeModal");
      el("gradeForm").reset();
      await refresh();
    } catch (err) {
      toast("Erreur : " + err.message);
    }
  });

  el("downloadGradeTemplate")?.addEventListener("click", () => {
    const rows = [
      ["Élève", "Classe", "Matière", "Coefficient", "Note", "Type", "Trimestre"],
      ["Amadou Ndiaye", "6ème A", "Mathématiques", 4, 16, "Devoir", "Trimestre 1"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Notes");
    XLSX.writeFile(wb, "modele_import_notes.xlsx");
  });

  el("importGradesInput")?.addEventListener("change", (e) => importExcel(e.target.files[0]));
}

function importExcel(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const wb = XLSX.read(e.target.result, { type: "array" });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
    let count = 0;
    for (const r of rows) {
      const note = Number(String(r["Note"] ?? "").replace(",", "."));
      if (r["Élève"] && r["Matière"] && !isNaN(note) && note >= 0 && note <= 20) {
        try {
          await insertRow("grades", {
            student_name: String(r["Élève"]),
            class_name: String(r["Classe"] || ""),
            subject: String(r["Matière"]),
            assessment_type: String(r["Type"] || "Devoir"),
            note,
            coefficient: Number(r["Coefficient"]) || 1,
            period: String(r["Trimestre"] || "Trimestre 1"),
          });
          count++;
        } catch (_) {}
      }
    }
    toast(count + " note(s) importée(s)");
    await refresh();
  };
  reader.readAsArrayBuffer(file);
}
