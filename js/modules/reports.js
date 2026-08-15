// ==========================================================================
// Centre de rapports : indicateurs agrégés + export Excel/CSV/PDF (impression).
// ==========================================================================
import { listRows, state } from "../state.js";
import { fmtMoney, toast } from "../ui.js";

const el = (id) => document.getElementById(id);

export async function refresh() {
  // rien à charger tant que l'utilisateur n'a pas cliqué "Générer"
}

async function generate() {
  const [students, teachers, payments, grades] = await Promise.all([
    listRows("students"),
    listRows("teachers"),
    listRows("payments"),
    listRows("grades"),
  ]);
  const currency = state.school?.currency || "FCFA";
  const revenue = payments.reduce((a, p) => a + Number(p.amount_paid || 0), 0);
  const due = payments.reduce((a, p) => a + Number(p.amount_due || 0), 0);

  el("reportResult").innerHTML = `
    <div class="notice success">Rapport généré à partir des données actuelles de l'établissement.</div>
    <table class="table">
      <tr><th>Indicateur</th><th>Valeur</th></tr>
      <tr><td>Élèves inscrits</td><td>${students.length}</td></tr>
      <tr><td>Enseignants actifs</td><td>${teachers.length}</td></tr>
      <tr><td>Notes saisies</td><td>${grades.length}</td></tr>
      <tr><td>Paiements enregistrés</td><td>${payments.length}</td></tr>
      <tr><td>Recettes encaissées</td><td>${fmtMoney(revenue, currency)}</td></tr>
      <tr><td>Reste à recouvrer</td><td>${fmtMoney(due - revenue, currency)}</td></tr>
    </table>`;
}

function exportExcel() {
  const rows = [
    ["Élève", "Classe", "Parent", "Statut"],
    ...(state.cache.students || []).map((s) => [s.name, s.class_name, s.parent_name, s.status]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Rapport");
  XLSX.writeFile(wb, "rapport_etablissement.xlsx");
  toast("Export Excel téléchargé");
}

function exportCSV() {
  const rows = [["Élève", "Classe", "Parent"], ...(state.cache.students || []).map((s) => [s.name, s.class_name, s.parent_name])];
  const csv = rows.map((r) => r.map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(";")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = "rapport_etablissement.csv";
  a.click();
  toast("CSV exporté");
}

export function mount() {
  el("generateReportBtn")?.addEventListener("click", generate);
  el("reportExportExcel")?.addEventListener("click", exportExcel);
  el("reportExportCSV")?.addEventListener("click", exportCSV);
  el("reportExportPdf")?.addEventListener("click", () => window.print());
}
