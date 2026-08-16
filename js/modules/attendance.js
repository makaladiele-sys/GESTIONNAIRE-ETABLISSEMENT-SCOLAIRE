// ==========================================================================
// Présences & assiduité — appel élève par élève, avec liste des absents
// consultable par jour et par classe.
// ==========================================================================
import { listRows, upsertRows, state } from "../state.js";
import { toast, openModal, closeModal, escapeHtml } from "../ui.js";

const el = (id) => document.getElementById(id);
const today = () => new Date().toISOString().slice(0, 10);

function classNames() {
  const classes = state.cache.classes || [];
  if (classes.length) return classes.map((c) => c.name);
  return [...new Set((state.cache.students || []).map((s) => s.class_name).filter(Boolean))];
}

export async function refresh() {
  if (!state.cache.students) await listRows("students");
  if (!state.cache.classes) await listRows("classes");
  if (el("fAttFilterDate") && !el("fAttFilterDate").value) el("fAttFilterDate").value = today();
  populateClassFilter();
  await loadRecordsAndRender();
}

function populateClassFilter() {
  const sel = el("attClassFilter");
  if (!sel) return;
  const names = classNames();
  const current = sel.value;
  sel.innerHTML = `<option value="">Toutes les classes</option>` + names.map((n) => `<option>${escapeHtml(n)}</option>`).join("");
  if (names.includes(current)) sel.value = current;
}

async function loadRecordsAndRender() {
  const date = el("fAttFilterDate")?.value || today();
  const records = await listRows("attendance_records", { orderBy: "student_name", ascending: true, filters: { date } });
  renderTable(records, date);
}

function renderTable(records) {
  const all = records || state.cache.attendance_records || [];
  const classFilter = el("attClassFilter")?.value || "";
  const statusFilter = el("attStatusFilter")?.value ?? "Absent";

  const present = all.filter((r) => r.status === "Présent").length;
  const absent = all.filter((r) => r.status === "Absent").length;
  const late = all.filter((r) => r.status === "Retard").length;
  el("attPresent") && (el("attPresent").textContent = present);
  el("attAbsent") && (el("attAbsent").textContent = absent);
  el("attLate") && (el("attLate").textContent = late);

  const rows = all.filter((r) => (!classFilter || r.class_name === classFilter) && (!statusFilter || r.status === statusFilter));

  el("attendanceBody").innerHTML =
    rows
      .map(
        (r) => `<tr>
      <td><b>${escapeHtml(r.student_name)}</b></td>
      <td>${escapeHtml(r.class_name)}</td>
      <td><span class="badge ${r.status === "Présent" ? "green" : r.status === "Retard" ? "orange" : "red"}">${escapeHtml(r.status)}</span></td>
      <td>${escapeHtml(r.date)}</td>
    </tr>`
      )
      .join("") ||
    `<tr><td colspan="4" class="empty">${
      all.length === 0 ? "Aucun appel n'a encore été fait pour cette date." : "Aucun élève avec ce statut pour ce filtre."
    }</td></tr>`;
}

function renderRollCallList(className, existing) {
  const students = (state.cache.students || []).filter((s) => s.class_name === className);
  const byName = {};
  (existing || []).forEach((r) => (byName[r.student_name] = r.status));

  el("rollCallList").innerHTML = students.length
    ? `<table class="table"><thead><tr><th>Élève</th><th>Statut</th></tr></thead><tbody>` +
      students
        .map((s) => {
          const current = byName[s.name] || "Présent";
          return `<tr>
          <td>${escapeHtml(s.name)}</td>
          <td>
            <select class="form-control roll-status" data-name="${escapeHtml(s.name)}">
              <option value="Présent" ${current === "Présent" ? "selected" : ""}>Présent</option>
              <option value="Absent" ${current === "Absent" ? "selected" : ""}>Absent</option>
              <option value="Retard" ${current === "Retard" ? "selected" : ""}>Retard</option>
            </select>
          </td>
        </tr>`;
        })
        .join("") +
      `</tbody></table>`
    : `<div class="empty">Aucun élève dans cette classe pour le moment.</div>`;
}

async function loadRollCall() {
  const className = el("fRollClass").value;
  const date = el("fRollDate").value || today();
  if (!className) {
    el("rollCallList").innerHTML = `<div class="empty">Choisissez une classe.</div>`;
    return;
  }
  const existing = await listRows("attendance_records", { filters: { date, class_name: className } });
  renderRollCallList(className, existing);
}

export function mount() {
  el("fAttFilterDate")?.addEventListener("change", loadRecordsAndRender);
  el("attClassFilter")?.addEventListener("change", () => renderTable());
  el("attStatusFilter")?.addEventListener("change", () => renderTable());

  el("openAddAttendance")?.addEventListener("click", () => {
    el("fRollClass") && (el("fRollClass").innerHTML = classNames().map((n) => `<option>${escapeHtml(n)}</option>`).join(""));
    el("fRollDate") && (el("fRollDate").value = el("fAttFilterDate")?.value || today());
    openModal("attendanceModal");
    loadRollCall();
  });

  el("fRollClass")?.addEventListener("change", loadRollCall);
  el("fRollDate")?.addEventListener("change", loadRollCall);

  el("saveRollCallBtn")?.addEventListener("click", async () => {
    const className = el("fRollClass").value;
    const date = el("fRollDate").value || today();
    if (!className) return toast("Choisissez une classe.");
    const selects = document.querySelectorAll("#rollCallList .roll-status");
    if (!selects.length) return toast("Aucun élève à enregistrer dans cette classe.");
    const rows = Array.from(selects).map((sel) => ({
      student_name: sel.dataset.name,
      class_name: className,
      date,
      status: sel.value,
    }));
    try {
      await upsertRows("attendance_records", rows, "school_id,student_name,date");
      toast("Appel enregistré (" + rows.length + " élève(s))");
      closeModal("attendanceModal");
      el("fAttFilterDate") && (el("fAttFilterDate").value = date);
      await loadRecordsAndRender();
    } catch (err) {
      toast("Erreur : " + err.message);
    }
  });
}
