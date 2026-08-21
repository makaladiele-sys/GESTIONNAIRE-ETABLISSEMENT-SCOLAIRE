// ==========================================================================
// Génération de documents Word (.docx) au design soigné, partagée par tous
// les modules qui exportent une liste (Paiements, Élèves, Parents,
// Recouvrement). Centraliser ici évite d'avoir 4 styles différents.
//
// Palette : vert foncé (accent principal, proche du logo Chift Digital
// Academy) + rouge (accent secondaire) + gris clair (lignes alternées).
// ==========================================================================
import { state } from "../state.js";

const BRAND_GREEN = "155843";
const BRAND_RED = "B3202A";
const ROW_ALT = "F3F6F5";
const BORDER_GRAY = "DADFE3";

function thinBorder(color = BORDER_GRAY) {
  return { style: "single", size: 4, color };
}

function tableBorders() {
  return {
    top: thinBorder(),
    bottom: thinBorder(),
    left: thinBorder(),
    right: thinBorder(),
    insideHorizontal: thinBorder(),
    insideVertical: thinBorder(),
  };
}

/**
 * Construit et télécharge un .docx présentable à partir d'une liste
 * d'objets uniformes (chaque clé = une colonne).
 *
 * @param {string} documentTitle - Titre du document (ex. "Paiements")
 * @param {object[]} rows - Lignes de données ; les clés du premier objet
 *   définissent les colonnes, dans l'ordre.
 * @param {string} filename - Nom du fichier téléchargé (ex. "paiements.docx")
 */
export async function exportStyledDocx(documentTitle, rows, filename) {
  const {
    Document,
    Packer,
    Table,
    TableRow,
    TableCell,
    Paragraph,
    TextRun,
    WidthType,
    AlignmentType,
    ShadingType,
    HeadingLevel,
  } = docx;

  const headers = Object.keys(rows[0]);
  const schoolName = state.school?.name || "Établissement";
  const dateStr = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

  // ---- En-tête du tableau (fond vert, texte blanc) ----------------------
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(
      (h) =>
        new TableCell({
          width: { size: 100 / headers.length, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, color: "auto", fill: BRAND_GREEN },
          margins: { top: 100, bottom: 100, left: 100, right: 100 },
          children: [
            new Paragraph({
              children: [new TextRun({ text: h, bold: true, color: "FFFFFF", size: 20 })],
            }),
          ],
        })
    ),
  });

  // ---- Lignes de données, alternées pour la lisibilité -------------------
  const dataRows = rows.map(
    (r, i) =>
      new TableRow({
        children: headers.map(
          (h) =>
            new TableCell({
              width: { size: 100 / headers.length, type: WidthType.PERCENTAGE },
              shading: i % 2 === 1 ? { type: ShadingType.CLEAR, color: "auto", fill: ROW_ALT } : undefined,
              margins: { top: 80, bottom: 80, left: 100, right: 100 },
              children: [new Paragraph({ children: [new TextRun({ text: String(r[h] ?? ""), size: 20 })] })],
            })
        ),
      })
  );

  const doc = new Document({
    sections: [
      {
        properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
        children: [
          // Bandeau nom de l'établissement
          new Paragraph({
            children: [new TextRun({ text: schoolName.toUpperCase(), bold: true, size: 30, color: BRAND_GREEN })],
          }),
          // Filet rouge fin sous le nom
          new Paragraph({
            border: { bottom: { color: BRAND_RED, space: 4, style: "single", size: 12 } },
            spacing: { after: 200 },
            children: [new TextRun({ text: "", size: 2 })],
          }),
          // Titre du document + date
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { after: 40 },
            children: [new TextRun({ text: documentTitle, bold: true, size: 26, color: "1A1A1A" })],
          }),
          new Paragraph({
            spacing: { after: 240 },
            children: [new TextRun({ text: `Exporté le ${dateStr}`, italics: true, size: 18, color: "666666" })],
          }),
          // Tableau
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: tableBorders(),
            rows: [headerRow, ...dataRows],
          }),
          // Pied de page
          new Paragraph({
            spacing: { before: 400 },
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: `${rows.length} ligne(s) — document généré automatiquement`, size: 16, color: "999999" })],
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

