// ==========================================================================
// Présences & assiduité (saisie agrégée par classe et par jour)
// ==========================================================================
import { listRows, insertRow, state } from "../state.js";
import { toast, openModal, closeModal, escapeHtml } from "../ui.js";

const el = (id) => document.getElementById(id);

export async function refresh() {
  const rows = await listRows("attendance", { orderBy: "date", ascending: false });
  const today = new Date().toISOString().slice(0, 10);
  const todays = rows.filter((r) => r.date === today);
  const present = todays.reduce((a, r) => a + Number(r.present || 0), 0);
  const absent = todays.reduce((a, r) => a + Number(r.absent || 0), 0);
  const late = todays.reduce((a, r) => a + Number(r.late || 0), 0);
  el("attPresent") && (el("attPresent").textContent = present);
  el("attAbsent") && (el("attAbsent").textContent = absent);
  el("attLate") && (el("attLate").textContent = late);

  el("attendanceBody").innerHTML =
    rows
      .slice(0, 40)
      .map((r) => {
        const total = Number(r.present || 0) + Number(r.absent || 0);
        const rate = total ? Math.round((Number(r.present || 0) / total) * 100) : 0;
        return `<tr>
        <td>${escapeHtml(r.date)}</td>
        <td><b>${escapeHtml(r.class_name)}</b></td>
        <td>${r.present}</td>
        <td>${r.absent}</td>
        <td>${r.late}</td>
        <td><span class="badge ${rate >= 90 ? "green" : rate >= 80 ? "orange" : "red"}">${rate}%</span></td>
      </tr>`;
      })
      .join("") || `<tr><td colspan="6" class="empty">Aucune présence saisie.</td></tr>`;
}

export function mount() {
  el("openAddAttendance")?.addEventListener("click", () => {
    el("attendanceForm")?.reset();
    const dateInput = el("fAttDate");
    if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
    openModal("attendanceModal");
  });

  el("attendanceForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      class_name: el("fAttClass").value.trim(),
      date: el("fAttDate").value,
      present: Number(el("fAttPresent").value) || 0,
      absent: Number(el("fAttAbsent").value) || 0,
      late: Number(el("fAttLate").value) || 0,
    };
    try {
      await insertRow("attendance", payload);
      toast("Présences enregistrées");
      closeModal("attendanceModal");
      await refresh();
    } catch (err) {
      toast("Erreur : " + err.message);
    }
  });
}
