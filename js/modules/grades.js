// ==========================================================================
// Notes & Gradebook — un enseignant ne voit et ne saisit que pour SES
// classes/matières (RLS appliqué en base, voir sql/06_teacher_grading_workflow.sql).
// Une fois une classe+matière+période "envoyée au directeur", elle est
// verrouillée pour l'enseignant ; seul un compte "admin" peut la modifier
// ou la réouvrir.
// ==========================================================================
import { listRows, insertRow, deleteRow, state, isPlatformAdmin } from "../state.js";
import { toast, openModal, closeModal, escapeHtml } from "../ui.js";

const el = (id) => document.getElementById(id);
const PERIODS = ["Trimestre 1", "Trimestre 2", "Trimestre 3"];
const DEFAULT_COEF = { "Devoir 1": 1, "Devoir 2": 1, "Devoir 3": 1, Composition: 2 };

function isAdmin() {
  return state.profile?.role === "admin";
}
function isTeacher() {
  return state.profile?.role === "teacher";
}

function myAssignments() {
  return (state.cache.teacher_assignments || []).filter((a) => a.teacher_user_id === state.profile?.id);
}

function relevantAssignments() {
  // admin/platform_admin voient toutes les affectations de l'établissement,
  // un enseignant ne voit que les siennes.
  if (isAdmin() || isPlatformAdmin()) return state.cache.teacher_assignments || [];
  return myAssignments();
}

export async function refresh() {
  if (!state.cache.students) await listRows("students");
  if (!state.cache.classes) await listRows("classes");
  if (!state.cache.subjects) await listRows("subjects");
  await listRows("teacher_assignments");
  await listRows("grade_submissions");
  const grades = await listRows("grades", { orderBy: "created_at", ascending: false });
  renderSubmissions();
  renderTable(grades);
}

// ---- Tableau des notes -------------------------------------------------
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
      .join("") || `<tr><td colspan="8" class="empty">Aucune note pour ce filtre.</td></tr>`;
}

// ---- Suivi des envois ---------------------------------------------------
function findSubmission(className, subject, period) {
  return (state.cache.grade_submissions || []).find(
    (s) => s.class_name === className && s.subject === subject && s.period === period
  );
}

function renderSubmissions() {
  const assignments = relevantAssignments();
  const seen = new Set();
  const combos = [];
  assignments.forEach((a) => {
    PERIODS.forEach((p) => {
      const key = a.class_name + "|" + a.subject + "|" + p;
      if (seen.has(key)) return;
      seen.add(key);
      combos.push({ class_name: a.class_name, subject: a.subject, period: p });
    });
  });

  el("submissionsBody").innerHTML =
    combos
      .map((c) => {
        const count = (state.cache.grades || []).filter(
          (g) => g.class_name === c.class_name && g.subject === c.subject && g.period === c.period
        ).length;
        const submission = findSubmission(c.class_name, c.subject, c.period);
        const canAct = isAdmin() || isPlatformAdmin() || (isTeacher() && myAssignments().some((a) => a.class_name === c.class_name && a.subject === c.subject));

        let statusBadge, actionHtml;
        if (submission) {
          statusBadge = `<span class="badge green">🔒 Envoyé le ${new Date(submission.submitted_at).toLocaleDateString("fr-FR")}</span>`;
          actionHtml =
            isAdmin() || isPlatformAdmin()
              ? `<button class="btn btn-light btn-sm" data-reopen="${submission.id}">Réouvrir</button>`
              : "—";
        } else if (count > 0) {
          statusBadge = `<span class="badge orange">✏️ En cours (${count} note(s))</span>`;
          actionHtml = canAct
            ? `<button class="btn btn-primary btn-sm" data-submit="${encodeURIComponent(c.class_name)}|${encodeURIComponent(c.subject)}|${encodeURIComponent(c.period)}">Envoyer au directeur</button>`
            : "—";
        } else {
          statusBadge = `<span class="badge gray">Aucune note</span>`;
          actionHtml = "—";
        }

        return `<tr>
        <td><b>${escapeHtml(c.class_name)}</b></td>
        <td>${escapeHtml(c.subject)}</td>
        <td>${escapeHtml(c.period)}</td>
        <td>${statusBadge}</td>
        <td>${actionHtml}</td>
      </tr>`;
      })
      .join("") || `<tr><td colspan="5" class="empty">Aucune affectation classe/matière pour le moment.</td></tr>`;
}

// ---- Formulaire de saisie (cascade classe → matière → élève) -----------
function classOptionsForRole() {
  const names = isAdmin() || isPlatformAdmin() ? (state.cache.classes || []).map((c) => c.name) : [...new Set(myAssignments().map((a) => a.class_name))];
  return [...new Set(names)];
}

function subjectsForClass(className) {
  if (isAdmin() || isPlatformAdmin()) return [...new Set((state.cache.subjects || []).map((s) => s.name))];
  return [...new Set(myAssignments().filter((a) => a.class_name === className).map((a) => a.subject))];
}

function studentsForClass(className) {
  return (state.cache.students || []).filter((s) => s.class_name === className);
}

function refreshSubjectOptions() {
  const className = el("fGradeClass").value;
  const subjects = subjectsForClass(className);
  el("fGradeSubject").innerHTML = subjects.map((s) => `<option>${escapeHtml(s)}</option>`).join("") || `<option value="">—</option>`;
  refreshStudentOptions();
  updateLockNotice();
}

function refreshStudentOptions() {
  const className = el("fGradeClass").value;
  const students = studentsForClass(className);
  el("fGradeStudent").innerHTML =
    students.map((s) => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`).join("") || `<option value="">Aucun élève dans cette classe</option>`;
}

function updateLockNotice() {
  const className = el("fGradeClass").value;
  const subject = el("fGradeSubject").value;
  const period = el("fGradePeriod").value;
  const submission = className && subject && period ? findSubmission(className, subject, period) : null;
  const notice = el("gradeLockNotice");
  const saveBtn = el("saveGradeBtn");
  const locked = submission && !isAdmin() && !isPlatformAdmin();
  if (notice) {
    notice.style.display = locked ? "block" : "none";
    notice.textContent = locked
      ? "🔒 Ces notes ont déjà été envoyées au directeur — vous ne pouvez plus les modifier. Contactez la direction pour les réouvrir."
      : "";
  }
  if (saveBtn) saveBtn.disabled = Boolean(locked);
}

export function mount() {
  el("gradeSearch")?.addEventListener("input", () => renderTable());
  el("gradePeriod")?.addEventListener("change", () => renderTable());

  el("openAddGrade")?.addEventListener("click", () => {
    const classNames = classOptionsForRole();
    if (isTeacher() && classNames.length === 0) {
      toast("Aucune classe/matière ne vous est encore affectée. Contactez la direction.");
      return;
    }
    el("fGradeClass").innerHTML = classNames.map((n) => `<option>${escapeHtml(n)}</option>`).join("");
    el("gradeForm")?.reset();
    refreshSubjectOptions();
    openModal("gradeModal");
  });

  el("fGradeClass")?.addEventListener("change", refreshSubjectOptions);
  el("fGradeSubject")?.addEventListener("change", () => {
    refreshStudentOptions();
    updateLockNotice();
  });
  el("fGradePeriod")?.addEventListener("change", updateLockNotice);
  el("fGradeType")?.addEventListener("change", () => {
    const t = el("fGradeType").value;
    if (DEFAULT_COEF[t] !== undefined) el("fGradeCoef").value = DEFAULT_COEF[t];
  });

  el("gradesBody")?.addEventListener("click", async (e) => {
    const delId = e.target.closest("[data-del]")?.dataset.del;
    if (delId) {
      if (!confirm("Supprimer cette note ?")) return;
      try {
        await deleteRow("grades", delId);
        toast("Note supprimée");
        await refresh();
      } catch (err) {
        toast(friendlyLockError(err));
      }
    }
  });

  el("submissionsBody")?.addEventListener("click", async (e) => {
    const submitKey = e.target.closest("[data-submit]")?.dataset.submit;
    const reopenId = e.target.closest("[data-reopen]")?.dataset.reopen;
    if (submitKey) {
      const [className, subject, period] = submitKey.split("|").map(decodeURIComponent);
      if (!confirm(`Envoyer les notes de ${className} / ${subject} / ${period} au directeur ? Vous ne pourrez plus les modifier ensuite.`)) return;
      try {
        await insertRow("grade_submissions", { class_name: className, subject, period, submitted_by: state.profile?.id });
        toast("Notes envoyées au directeur");
        await refresh();
      } catch (err) {
        toast("Erreur : " + err.message);
      }
    }
    if (reopenId) {
      if (!confirm("Réouvrir ces notes pour modification ?")) return;
      try {
        await deleteRow("grade_submissions", reopenId);
        toast("Notes réouvertes");
        await refresh();
      } catch (err) {
        toast("Erreur : " + err.message);
      }
    }
  });

  el("gradeForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const className = el("fGradeClass").value;
    const subject = el("fGradeSubject").value;
    const studentName = el("fGradeStudent").value;
    if (!className || !subject || !studentName) {
      toast("Choisissez une classe, une matière et un élève.");
      return;
    }
    const payload = {
      student_name: studentName,
      class_name: className,
      subject,
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
      toast(friendlyLockError(err));
    }
  });

  el("downloadGradeTemplate")?.addEventListener("click", () => {
    const rows = [
      ["Élève", "Classe", "Matière", "Coefficient", "Note", "Type", "Trimestre"],
      ["Amadou Ndiaye", "6ème A", "Mathématiques", 1, 16, "Devoir 1", "Trimestre 1"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Notes");
    XLSX.writeFile(wb, "modele_import_notes.xlsx");
  });

  el("importGradesInput")?.addEventListener("change", (e) => importExcel(e.target.files[0]));
}

function friendlyLockError(err) {
  const msg = String(err?.message || err || "");
  if (/row-level security|policy/i.test(msg)) {
    return "Action refusée : ces notes ne vous sont pas affectées, ou ont déjà été envoyées au directeur.";
  }
  return "Erreur : " + msg;
}

function importExcel(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const wb = XLSX.read(e.target.result, { type: "array" });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
    let count = 0;
    let failed = 0;
    for (const r of rows) {
      const note = Number(String(r["Note"] ?? "").replace(",", "."));
      if (r["Élève"] && r["Matière"] && !isNaN(note) && note >= 0 && note <= 20) {
        try {
          await insertRow("grades", {
            student_name: String(r["Élève"]),
            class_name: String(r["Classe"] || ""),
            subject: String(r["Matière"]),
            assessment_type: String(r["Type"] || "Devoir 1"),
            note,
            coefficient: Number(r["Coefficient"]) || 1,
            period: String(r["Trimestre"] || "Trimestre 1"),
          });
          count++;
        } catch (_) {
          failed++;
        }
      }
    }
    toast(count + " note(s) importée(s)" + (failed ? `, ${failed} refusée(s) (hors de vos affectations)` : ""));
    await refresh();
  };
  reader.readAsArrayBuffer(file);
}
