// ==========================================================================
// Recouvrement : compare ce qui devrait être payé à ce qui a réellement été
// payé, élève par élève. Utilise le calcul partagé de feeCalc.js — les
// mêmes chiffres apparaissent dans Facturation & Paiements.
// ==========================================================================
import { listRows, state } from "../state.js";
import { toast, escapeHtml, fmtMoney } from "../ui.js";
import { computeCollectionsRows } from "./feeCalc.js";

const el = (id) => document.getElementById(id);

// Dernière liste filtrée affichée à l'écran — réutilisée telle quelle pour
// les exports, afin que le fichier téléchargé corresponde exactement à ce
// que l'utilisateur voit (mêmes filtres classe/statut/recherche).
let lastFilteredRows = [];

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

export function render() {
  const rows = computeCollectionsRows();
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
  lastFilteredRows = filtered;

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

// --------------------------------------------------------------------------
// Exports Excel / Word
// --------------------------------------------------------------------------

function collectionsExportRows() {
  return lastFilteredRows.map((r) => {
    const s = r.student;
    return {
      "Élève": s.name || "",
      "Classe": s.class_name || "—",
      "Parent": s.parent_name || "—",
      "Téléphone": s.phone || "—",
      "Mois écoulés": r.months,
      "Attendu": Math.round(r.expected),
      "Payé": Math.round(r.paid),
      "Reste (retard)": Math.round(Math.max(0, r.remaining)),
      "Dernier mode": r.lastMethod || "—",
      "Statut": r.remaining > 0 ? "En retard" : "À jour",
    };
  });
}

function exportCollectionsToExcel() {
  const rows = collectionsExportRows();
  if (!rows.length) {
    toast("Aucune ligne à exporter avec ces filtres.");
    return;
  }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Recouvrement");
  XLSX.writeFile(wb, "recouvrement.xlsx");
}

async function exportCollectionsToWord() {
  const rows = collectionsExportRows();
  if (!rows.length) {
    toast("Aucune ligne à exporter avec ces filtres.");
    return;
  }

  const { Document, Packer, Table, TableRow, TableCell, Paragraph, TextRun, WidthType } = docx;
  const headers = Object.keys(rows[0]);

  const headerRow = new TableRow({
    children: headers.map(
      (h) =>
        new TableCell({
          width: { size: 100 / headers.length, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
        })
    ),
  });

  const dataRows = rows.map(
    (r) =>
      new TableRow({
        children: headers.map(
          (h) =>
            new TableCell({
              width: { size: 100 / headers.length, type: WidthType.PERCENTAGE },
              children: [new Paragraph(String(r[h] ?? ""))],
            })
        ),
      })
  );

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ children: [new TextRun({ text: `Recouvrement — ${state.school?.name || ""}`, bold: true, size: 28 })] }),
          new Paragraph({ text: "" }),
          new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...dataRows] }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "recouvrement.docx";
  a.click();
  URL.revokeObjectURL(url);
}

export function mount() {
  el("colClassFilter")?.addEventListener("change", render);
  el("colStatusFilter")?.addEventListener("change", render);
  el("colSearch")?.addEventListener("input", render);
  el("exportCollectionsExcel")?.addEventListener("click", exportCollectionsToExcel);
  el("exportCollectionsWord")?.addEventListener("click", exportCollectionsToWord);
}
