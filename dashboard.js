// ==========================================================================
// Tableau de bord : indicateurs consolidés de l'établissement courant.
// ==========================================================================
import { listRows, state } from "../state.js";
import { fmtMoney, escapeHtml, showPage } from "../ui.js";

export async function refresh() {
  const [students, teachers, payments, classes] = await Promise.all([
    listRows("students"),
    listRows("teachers"),
    listRows("payments"),
    listRows("classes"),
  ]);

  const revenue = payments.reduce((a, p) => a + Number(p.amount_paid || 0), 0);
  const debt = payments.reduce((a, p) => a + Math.max(0, Number(p.amount_due || 0) - Number(p.amount_paid || 0)), 0);
  const currency = state.school?.currency || "FCFA";

  set("statStudents", students.length);
  set("statTeachers", teachers.length);
  set("statRevenue", fmtMoney(revenue, currency));
  set("statDebt", fmtMoney(debt, currency));
  set("statClasses", classes.length);

  const cycles = {};
  for (const c of classes) cycles[c.cycle] = (cycles[c.cycle] || 0) + 1;
  const cycleBox = document.getElementById("dashCycles");
  if (cycleBox) {
    const max = Math.max(1, ...Object.values(cycles));
    cycleBox.innerHTML =
      Object.entries(cycles)
        .map(
          ([name, count]) =>
            `<div class="krow"><span>${escapeHtml(name)}</span><div class="bar"><i style="width:${(count / max) * 100}%"></i></div><b>${count}</b></div>`
        )
        .join("") || `<div class="empty">Ajoutez des classes pour voir la répartition.</div>`;
  }

  const recentBox = document.getElementById("recentStudents");
  if (recentBox) {
    recentBox.innerHTML =
      students
        .slice(0, 6)
        .map(
          (s) =>
            `<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.class_name || "—")}</td><td>${escapeHtml(s.parent_name || "—")}</td><td><span class="badge ${s.status === "Actif" ? "green" : "orange"}">${escapeHtml(s.status)}</span></td></tr>`
        )
        .join("") || `<tr><td colspan="4" class="empty">Aucun élève inscrit pour le moment.</td></tr>`;
  }

  const unpaid = payments.filter((p) => Number(p.amount_due) > Number(p.amount_paid)).length;
  const alertBox = document.getElementById("dashAlerts");
  if (alertBox) {
    const items = [];
    if (unpaid) items.push(`<div class="notice warning">💰 ${unpaid} paiement(s) incomplet(s) à suivre.</div>`);
    if (!classes.length) items.push(`<div class="notice">📚 Ajoutez vos premières classes dans "Classes".</div>`);
    if (!students.length) items.push(`<div class="notice">👨‍🎓 Ajoutez votre premier élève pour démarrer.</div>`);
    items.push(`<div class="notice success">✓ Données synchronisées avec Supabase en temps réel.</div>`);
    alertBox.innerHTML = items.join("");
  }
}

function set(id, val) {
  const e = document.getElementById(id);
  if (e) e.textContent = val;
}

export function mount() {
  // La navigation du bouton "＋ Nouvel élève" est gérée globalement dans app.js
}
