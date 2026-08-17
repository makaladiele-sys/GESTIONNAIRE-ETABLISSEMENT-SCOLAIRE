// ==========================================================================
// Recouvrement : compare ce qui devrait être payé (frais mensuel de la
// classe × nombre de mois écoulés depuis l'inscription) à ce qui a
// réellement été payé (paiements motif "Scolarité"), élève par élève.
// Le frais mensuel se configure dans Classes.
// ==========================================================================
import { listRows, state } from "../state.js";
import { escapeHtml, fmtMoney } from "../ui.js";

const el = (id) => document.getElementById(id);

function monthsElapsed(enrolledOn) {
  if (!enrolledOn) return 1;
  const start = new Date(enrolledOn);
  const now = new Date();
  const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + 1;
  return Math.max(1, months);
}

function computeRows() {
  const students = (state.cache.students || []).filter((s) => s.status === "Actif");
  const classes = state.cache.classes || [];
  const payments = state.cache.payments || [];

  const feeByClass = {};
  classes.forEach((c) => (feeByClass[c.name] = Number(c.monthly_fee) || 0));

  const paidByStudent = {};
  const lastMethodByStudent = {};
  payments
    .filter((p) => p.reason === "Scolarité")
    .forEach((p) => {
      paidByStudent[p.student_name] = (paidByStudent[p.student_name] || 0) + Number(p.amount_paid || 0);
      if (!(p.student_name in lastMethodByStudent)) lastMethodByStudent[p.student_name] = p.method;
    });

  return students.map((s) => {
    const fee = feeByClass[s.class_name] || 0;
    const months = monthsElapsed(s.enrolled_on);
    const expected = fee * months;
    const paid = paidByStudent[s.name] || 0;
    const remaining = expected - paid;
    return {
      student: s,
      fee,
      months,
      expected,
      paid,
      remaining,
      lastMethod: lastMethodByStudent[s.name] || null,
      configured: fee > 0,
    };
  });
}

export async function refresh() {
  if (!state.cache.students) await listRows("students");
  if (!state.cache.classes) await listRows("classes");
  if (!state.cache.payments) await listRows("payments");
  populateClassFilter();
  render();
}

function populateClassFilter() {
  const sel = el("colClassFilter");
  if (!sel) return;
  const names = [...new Set((state.cache.classes || []).map((c) => c.name))];
  const current = sel.value;
  sel.innerHTML = `<option value="">Toutes les classes</option>` + names.map((n) => `<option>${escapeHtml(n)}</option>`).join("");
  if (names.includes(current)) sel.value = current;
}

function render() {
  const rows = computeRows();
  const currency = state.school?.currency || "FCFA";

  const configuredRows = rows.filter((r) => r.configured);
  const unconfiguredCount = rows.length - configuredRows.length;

  const totalExpected = configuredRows.reduce((a, r) => a + r.expected, 0);
  const totalCollected = configuredRows.reduce((a, r) => a + r.paid, 0);
  const totalOverdue = configuredRows.reduce((a, r) => a + Math.max(0, r.remaining), 0);
  const rate = totalExpected > 0 ? Math.min(100, Math.round((totalCollected / totalExpected) * 100)) : 0;

  el("colExpected") && (el("colExpected").textContent = fmtMoney(totalExpected, currency));
  el("colCollected") && (el("colCollected").textContent = fmtMoney(totalCollected, currency));
  el("colOverdue") && (el("colOverdue").textContent = fmtMoney(totalOverdue, currency));
  el("colRate") && (el("colRate").textContent = rate + "%");

  const notice = el("collectionsNotice");
  if (notice) {
    if (unconfiguredCount > 0) {
      notice.style.display = "block";
      notice.textContent = `⚠️ ${unconfiguredCount} élève(s) dans une classe sans frais mensuel configuré — non comptabilisé(s) dans les totaux ci-dessous. Allez dans "Classes" pour renseigner le frais mensuel de chaque classe.`;
    } else {
      notice.style.display = "none";
    }
  }

  const classFilter = el("colClassFilter")?.value || "";
  const statusFilter = el("colStatusFilter")?.value ?? "overdue";
  const q = (el("colSearch")?.value || "").toLowerCase();

  const filtered = configuredRows.filter((r) => {
    if (classFilter && r.student.class_name !== classFilter) return false;
    if (statusFilter === "overdue" && r.remaining <= 0) return false;
    if (statusFilter === "ok" && r.remaining > 0) return false;
    if (q && !(r.student.name + " " + (r.student.parent_name || "")).toLowerCase().includes(q)) return false;
    return true;
  });

  filtered.sort((a, b) => b.remaining - a.remaining);

  el("collectionsBody").innerHTML =
    filtered
      .map((r) => {
        const s = r.student;
        const badge = r.remaining > 0 ? '<span class="badge red">En retard</span>' : '<span class="badge green">À jour</span>';
        return `<tr>
        <td><b>${escapeHtml(s.name)}</b></td>
        <td>${escapeHtml(s.class_name || "—")}</td>
        <td>${escapeHtml(s.parent_name || "—")}</td>
        <td>${escapeHtml(s.phone || "—")}</td>
        <td>${r.months}</td>
        <td>${fmtMoney(r.expected, currency)}</td>
        <td>${fmtMoney(r.paid, currency)}</td>
        <td><b>${fmtMoney(Math.max(0, r.remaining), currency)}</b></td>
        <td>${escapeHtml(r.lastMethod || "—")}</td>
        <td>${badge}</td>
      </tr>`;
      })
      .join("") || `<tr><td colspan="10" class="empty">Aucun élève ne correspond à ce filtre.</td></tr>`;
}

export function mount() {
  el("colClassFilter")?.addEventListener("change", render);
  el("colStatusFilter")?.addEventListener("change", render);
  el("colSearch")?.addEventListener("input", render);
}
