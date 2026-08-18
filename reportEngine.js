// ==========================================================================
// Moteur de rapport partagé — Excel (ExcelJS) et Word (docx.js), avec
// bandeau d'en-tête coloré aux couleurs de l'établissement (primary_color /
// accent_color de la table "schools") et ses coordonnées.
// Utilisé par toutes les listes exportables : Élèves, Parents/Tuteurs,
// Facturation & Paiements, Recouvrement, et le Centre de rapports.
// ==========================================================================
import { state } from "./state.js";
import { toast } from "./ui.js";

function hex(color, fallback) {
  const c = (color || "").replace("#", "").trim();
  return /^[0-9a-fA-F]{6}$/.test(c) ? c.toUpperCase() : fallback;
}

function schoolInfo() {
  const s = state.school || {};
  return {
    name: s.name || "Établissement",
    address: s.address || "",
    phone: s.phone || "",
    email: s.email || "",
    academicYear: s.current_academic_year || "",
    currency: s.currency || "FCFA",
    primary: hex(s.primary_color, "16233D"),
    accent: hex(s.accent_color, "C9A227"),
    logoUrl: s.logo_url || null,
  };
}

function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function fetchLogoBuffer(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

// columns: [{ key, header, width? }]
// rows: [{ key: value, ... }]
// totalsRow (optionnel): { key: value } affiché en pied de tableau, en gras.
export async function exportExcelReport({ title, columns, rows, filename, totalsRow }) {
  if (typeof ExcelJS === "undefined") {
    toast("Bibliothèque Excel indisponible — vérifiez votre connexion internet.");
    return;
  }
  const info = schoolInfo();
  const wb = new ExcelJS.Workbook();
  wb.creator = info.name;
  const ws = wb.addWorksheet((title || "Rapport").slice(0, 31));
  const colCount = columns.length;
  let cursor = 1;

  if (info.logoUrl) {
    const buf = await fetchLogoBuffer(info.logoUrl);
    if (buf) {
      const ext = info.logoUrl.toLowerCase().endsWith(".jpg") || info.logoUrl.toLowerCase().endsWith(".jpeg") ? "jpeg" : "png";
      const imgId = wb.addImage({ buffer: buf, extension: ext });
      ws.addImage(imgId, { tl: { col: 0, row: 0 }, ext: { width: 60, height: 60 } });
      ws.getRow(1).height = 46;
      ws.getColumn(1).width = Math.max(ws.getColumn(1).width || 10, 10);
    }
  }

  ws.mergeCells(cursor, 1, cursor, colCount);
  const titleCell = ws.getCell(cursor, 1);
  titleCell.value = info.name;
  titleCell.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + info.primary } };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(cursor).height = 30;
  cursor++;

  ws.mergeCells(cursor, 1, cursor, colCount);
  const metaParts = [info.address, info.phone, info.email].filter(Boolean).join("  •  ");
  const subCell = ws.getCell(cursor, 1);
  subCell.value = `${title}${info.academicYear ? " — Année " + info.academicYear : ""}   |   Généré le ${new Date().toLocaleDateString("fr-FR")}${metaParts ? "   |   " + metaParts : ""}`;
  subCell.font = { italic: true, size: 10, color: { argb: "FFFFFFFF" } };
  subCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + info.accent } };
  subCell.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(cursor).height = 22;
  cursor++;

  ws.addRow([]);
  cursor++;

  const headerRow = ws.addRow(columns.map((c) => c.header));
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + info.primary } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCCCCCC" } } };
  });

  rows.forEach((r, i) => {
    const row = ws.addRow(columns.map((c) => r[c.key] ?? ""));
    if (i % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F8" } };
      });
    }
  });

  if (totalsRow) {
    const tRow = ws.addRow(columns.map((c) => totalsRow[c.key] ?? ""));
    tRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7E2CF" } };
      cell.border = { top: { style: "thin", color: { argb: "FF999999" } } };
    });
  }

  columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width || 18;
  });

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
  toast("Export Excel téléchargé");
}

export async function exportWordReport({ title, columns, rows, filename, totalsRow }) {
  if (typeof docx === "undefined") {
    toast("Bibliothèque Word indisponible — vérifiez votre connexion internet.");
    return;
  }
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType, ImageRun } = docx;
  const info = schoolInfo();

  const headerChildren = [];
  if (info.logoUrl) {
    const buf = await fetchLogoBuffer(info.logoUrl);
    if (buf) {
      try {
        headerChildren.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new ImageRun({ data: buf, transformation: { width: 64, height: 64 } })],
          })
        );
      } catch {
        /* logo illisible — on continue sans */
      }
    }
  }

  headerChildren.push(
    new Paragraph({
      shading: { fill: info.primary, type: ShadingType.CLEAR, color: "auto" },
      alignment: AlignmentType.CENTER,
      spacing: { before: 60, after: 60 },
      children: [new TextRun({ text: info.name, bold: true, size: 40, color: "FFFFFF" })],
    }),
    new Paragraph({
      shading: { fill: info.accent, type: ShadingType.CLEAR, color: "auto" },
      alignment: AlignmentType.CENTER,
      spacing: { before: 40, after: 40 },
      children: [new TextRun({ text: `${title}${info.academicYear ? " — Année " + info.academicYear : ""}`, italics: true, bold: true, size: 24, color: "FFFFFF" })],
    })
  );

  const metaParts = [info.address, info.phone, info.email].filter(Boolean).join("   •   ");
  headerChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 240 },
      children: [
        new TextRun({
          text: (metaParts ? metaParts + "   •   " : "") + `Généré le ${new Date().toLocaleDateString("fr-FR")}`,
          italics: true,
          size: 18,
          color: "555555",
        }),
      ],
    })
  );

  const headerRow = new TableRow({
    tableHeader: true,
    children: columns.map(
      (c) =>
        new TableCell({
          shading: { fill: info.primary, type: ShadingType.CLEAR, color: "auto" },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: c.header, bold: true, color: "FFFFFF" })] })],
        })
    ),
  });

  const bodyRows = rows.map(
    (r, i) =>
      new TableRow({
        children: columns.map(
          (c) =>
            new TableCell({
              shading: i % 2 === 1 ? { fill: "F3F4F8", type: ShadingType.CLEAR, color: "auto" } : undefined,
              children: [new Paragraph({ text: String(r[c.key] ?? "") })],
            })
        ),
      })
  );

  const totalsTableRow = totalsRow
    ? [
        new TableRow({
          children: columns.map(
            (c) =>
              new TableCell({
                shading: { fill: "E7E2CF", type: ShadingType.CLEAR, color: "auto" },
                children: [new Paragraph({ children: [new TextRun({ text: String(totalsRow[c.key] ?? ""), bold: true })] })],
              })
          ),
        }),
      ]
    : [];

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...bodyRows, ...totalsTableRow],
  });

  const doc = new Document({
    sections: [{ children: [...headerChildren, table] }],
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, filename);
  toast("Export Word téléchargé");
}
