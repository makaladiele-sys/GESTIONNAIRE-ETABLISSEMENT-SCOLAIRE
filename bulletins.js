// ==========================================================================
// Bulletins & documents scolaires (générés côté client à partir des notes)
// ==========================================================================
import { listRows, state } from "../state.js";
import { escapeHtml } from "../ui.js";

const el = (id) => document.getElementById(id);

export async function refresh() {
  if (!state.cache.grades) await listRows("grades");
  if (!state.cache.students) await listRows("students");
  renderTable();
}

function computeAverages(period) {
  const grades = (state.cache.grades || []).filter((g) => g.period === period);
  const names = [...new Set(grades.map((g) => g.student_name))];
  return names.map((name) => {
    const gs = grades.filter((g) => g.student_name === name);
    let total = 0,
      coef = 0;
    gs.forEach((g) => {
      total += Number(g.note) * Number(g.coefficient);
      coef += Number(g.coefficient);
    });
    const student = (state.cache.students || []).find((s) => s.name === name);
    return { name, avg: coef ? total / coef : null, student, grades: gs };
  });
}

function renderTable() {
  const q = (el("bulletinSearch")?.value || "").toLowerCase();
  const period = el("bulletinPeriod")?.value || "Trimestre 1";
  const rows = computeAverages(period).filter((x) => (x.name + " " + (x.student?.matricule || "") + " " + (x.student?.class_name || "")).toLowerCase().includes(q));

  el("bulletinsBody").innerHTML =
    rows
      .map((x) => {
        const label = x.avg == null ? "—" : x.avg >= 16 ? "Très bien" : x.avg >= 14 ? "Bien" : x.avg >= 10 ? "Passable" : "À améliorer";
        return `<tr>
        <td><b>${escapeHtml(x.name)}</b></td>
        <td><span class="id-badge">${escapeHtml(x.student?.matricule || "—")}</span></td>
        <td>${escapeHtml(x.student?.class_name || "—")}</td>
        <td>${x.avg == null ? "—" : x.avg.toFixed(2) + "/20"}</td>
        <td><span class="badge ${x.avg >= 10 ? "green" : "red"}">${label}</span></td>
        <td><button class="btn btn-light btn-sm" data-open="${encodeURIComponent(x.name)}">Voir / imprimer</button></td>
      </tr>`;
      })
      .join("") || `<tr><td colspan="6" class="empty">Aucune note saisie pour cette période. Rendez-vous dans "Notes" pour commencer.</td></tr>`;
}

function openBulletin(name) {
  const period = el("bulletinPeriod").value;
  const data = computeAverages(period).find((x) => x.name === name);
  if (!data) return;
  const s = data.student;
  const rows = data.grades
    .map(
      (g) => `<tr><td>${escapeHtml(g.subject)}</td><td>${escapeHtml(g.assessment_type)}</td><td>${Number(g.note).toFixed(2)}</td><td>${g.coefficient}</td><td>${g.note >= 10 ? "Acquis" : "À renforcer"}</td></tr>`
    )
    .join("");
  const avg = data.avg;
  const decision = avg == null ? "—" : avg >= 16 ? "Très bien" : avg >= 14 ? "Bien" : avg >= 10 ? "Passable" : "À améliorer";

  el("bulletinPreview").innerHTML = `
    <div class="bulletin printable" id="printable">
      <div class="bulletin-head">
        <h2>${escapeHtml(state.school?.name || "Établissement")}</h2>
        <p>Bulletin de notes — ${escapeHtml(period)}</p>
        <small>Année scolaire ${escapeHtml(state.school?.current_academic_year || "")}</small>
      </div>
      <div class="bulletin-meta">
        <div><b>Élève :</b> ${escapeHtml(name)}</div>
        <div><b>Matricule :</b> ${escapeHtml(s?.matricule || "—")}</div>
        <div><b>Classe :</b> ${escapeHtml(s?.class_name || "—")}</div>
        <div><b>Moyenne générale :</b> ${avg == null ? "—" : avg.toFixed(2) + " / 20"}</div>
      </div>
      <table><thead><tr><th>Matière</th><th>Évaluation</th><th>Note</th><th>Coef.</th><th>Appréciation</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">Aucune note</td></tr>'}</tbody></table>
      <div style="text-align:right;margin-top:14px"><b>Moyenne générale : ${avg == null ? "—" : avg.toFixed(2) + " / 20"}</b></div>
      <div class="notice" style="margin-top:15px"><b>Décision :</b> ${decision}</div>
      <div style="display:flex;justify-content:space-between;margin-top:55px;font-size:12px">
        <span>Le Directeur</span><span>Le Professeur principal</span>
      </div>
    </div>
    <div class="no-print" style="text-align:center;margin:14px">
      <button class="btn btn-primary" id="printBulletinBtn">🖨 Imprimer / PDF</button>
    </div>`;
  el("printBulletinBtn")?.addEventListener("click", () => window.print());
  el("bulletinPreview").scrollIntoView({ behavior: "smooth" });
}

export function mount() {
  el("bulletinSearch")?.addEventListener("input", renderTable);
  el("bulletinPeriod")?.addEventListener("change", renderTable);
  el("bulletinsBody")?.addEventListener("click", (e) => {
    const name = e.target.closest("[data-open]")?.dataset.open;
    if (name) openBulletin(decodeURIComponent(name));
  });
}
