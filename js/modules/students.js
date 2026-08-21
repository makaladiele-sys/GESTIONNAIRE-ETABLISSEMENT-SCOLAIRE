// ==========================================================================
// Élèves : liste, ajout, modification, suppression, import/export Excel.
// --------------------------------------------------------------------------
// C'est le parent qui inscrit l'élève : ses coordonnées (nom, téléphone,
// email) et le frais mensuel sont donc saisis ICI, sur la fiche élève. La
// fiche "Parents / Tuteurs" est ensuite alimentée AUTOMATIQUEMENT à partir
// de ces informations (upsertParentForStudent ci-dessous) — pas besoin de
// ressaisir le parent séparément. Le rapprochement se fait par numéro de
// téléphone (identifiant le plus fiable), pour regrouper correctement les
// frères et sœurs sous un même parent.
// ==========================================================================
import { listRows, insertRow, updateRow, deleteRow, state } from "../state.js";
import { toast, openModal, closeModal, escapeHtml, fmtMoney } from "../ui.js";
import { exportStyledDocx } from "./docxExport.js";

const el = (id) => document.getElementById(id);
let editingId = null;

function classOptions() {
  const classes = state.cache.classes || [];
  const names = classes.length ? classes.map((c) => c.name) : ["CI", "CP", "CE1", "CE2", "CM1", "CM2", "6ème A", "5ème A", "4ème A", "3ème A", "Seconde A", "Première A", "Terminale A"];
  return names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
}

export async function refresh() {
  if (!state.cache.classes) await listRows("classes");
  if (!state.cache.parents) await listRows("parents");
  const students = await listRows("students", { orderBy: "name", ascending: true });
  populateClassFilter();
  renderTable(students);
}

// Crée ou met à jour automatiquement le parent lié à un élève, à partir des
// champs saisis sur la fiche élève. Retourne l'ID du parent (ou null si ni
// nom ni téléphone n'ont été renseignés).
async function upsertParentForStudent({ name, phone, email }, studentName) {
  const cleanName = (name || "").trim();
  const cleanPhone = (phone || "").trim();
  const cleanEmail = (email || "").trim();
  if (!cleanName && !cleanPhone) return null;

  if (!state.cache.parents) await listRows("parents");
  const parents = state.cache.parents;

  // Le téléphone est l'identifiant le plus fiable pour regrouper les
  // frères et sœurs sous le même parent (deux parents peuvent porter un
  // nom identique, rarement le même numéro).
  let match = cleanPhone ? parents.find((p) => p.phone && p.phone.trim() === cleanPhone) : null;
  if (!match && cleanName) match = parents.find((p) => (p.name || "").trim().toLowerCase() === cleanName.toLowerCase());

  if (match) {
    const patch = {};
    if (cleanName && cleanName !== match.name) patch.name = cleanName;
    if (cleanPhone && cleanPhone !== match.phone) patch.phone = cleanPhone;
    if (cleanEmail && cleanEmail !== match.email) patch.email = cleanEmail;
    if (Object.keys(patch).length) {
      const updated = await updateRow("parents", match.id, patch);
      Object.assign(match, updated);
    }
    return match.id;
  }

  const created = await insertRow("parents", {
    name: cleanName || "—",
    phone: cleanPhone,
    email: cleanEmail,
    children: studentName || "",
    balance: 0,
  });
  parents.push(created); // pour que les élèves suivants du même import se rattachent bien
  return created.id;
}

function populateClassFilter() {
  const sel = el("classFilter");
  if (!sel) return;
  const classes = [...new Set((state.cache.students || []).map((s) => s.class_name).filter(Boolean))];
  const current = sel.value;
  sel.innerHTML = `<option value="">Toutes les classes</option>` + classes.map((c) => `<option>${escapeHtml(c)}</option>`).join("");
  if (classes.includes(current)) sel.value = current;
}

function renderTable(students) {
  const q = (el("studentSearch")?.value || "").toLowerCase();
  const cls = el("classFilter")?.value || "";
  const rows = (students || state.cache.students || []).filter(
    (s) =>
      (s.name + " " + (s.matricule || "") + " " + (s.parent_name || "") + " " + (s.class_name || "")).toLowerCase().includes(q) &&
      (!cls || s.class_name === cls)
  );
  el("studentsBody").innerHTML =
    rows
      .map(
        (s) => `<tr>
      <td><span class="id-badge">${escapeHtml(s.matricule || "—")}</span></td>
      <td>👤 ${escapeHtml(s.name)}</td>
      <td>${escapeHtml(s.class_name || "—")}</td>
      <td>${escapeHtml(s.parent_name || "—")}</td>
      <td>${escapeHtml(s.phone || "—")}</td>
      <td>${Number(s.monthly_fee) > 0 ? fmtMoney(s.monthly_fee, state.school?.currency) : '<span class="muted">Tarif classe</span>'}</td>
      <td><span class="badge ${s.status === "Actif" ? "green" : "orange"}">${escapeHtml(s.status)}</span></td>
      <td>
        <button class="btn btn-light btn-sm" data-edit="${s.id}">✏️</button>
        <button class="btn btn-danger btn-sm" data-del="${s.id}">🗑️</button>
      </td>
    </tr>`
      )
      .join("") || `<tr><td colspan="8" class="empty">Aucun élève. Ajoutez-en un ou importez un fichier Excel.</td></tr>`;
}

function resetForm() {
  editingId = null;
  el("studentForm")?.reset();
  el("studentModalTitle") && (el("studentModalTitle").textContent = "Nouvel élève");
}

function generateMatricule() {
  const existing = new Set((state.cache.students || []).map((s) => s.matricule));
  let n = (state.cache.students || []).length + 1;
  let candidate = "ELV-" + String(n).padStart(4, "0");
  while (existing.has(candidate)) {
    n++;
    candidate = "ELV-" + String(n).padStart(4, "0");
  }
  return candidate;
}

function fillForm(s) {
  editingId = s.id;
  el("studentModalTitle") && (el("studentModalTitle").textContent = "Modifier l'élève");
  el("fStudentName").value = s.name || "";
  el("fStudentMat").value = s.matricule || "";
  el("fStudentClass").value = s.class_name || "";
  el("fStudentParent").value = s.parent_name || "";
  el("fStudentPhone").value = s.phone || "";
  el("fStudentParentEmail") && (el("fStudentParentEmail").value = (state.cache.parents || []).find((p) => p.id === s.parent_id)?.email || "");
  el("fStudentFee") && (el("fStudentFee").value = Number(s.monthly_fee) > 0 ? s.monthly_fee : "");
}

export function mount() {
  el("fStudentClass") && (el("fStudentClass").innerHTML = classOptions());
  el("studentSearch")?.addEventListener("input", () => renderTable());
  el("classFilter")?.addEventListener("change", () => renderTable());

  el("openAddStudent")?.addEventListener("click", () => {
    resetForm();
    el("fStudentClass") && (el("fStudentClass").innerHTML = classOptions());
    el("fStudentMat") && (el("fStudentMat").value = generateMatricule());
    openModal("studentModal");
  });

  el("studentsBody")?.addEventListener("click", async (e) => {
    const editId = e.target.closest("[data-edit]")?.dataset.edit;
    const delId = e.target.closest("[data-del]")?.dataset.del;
    if (editId) {
      const s = (state.cache.students || []).find((x) => x.id === editId);
      if (s) {
        el("fStudentClass") && (el("fStudentClass").innerHTML = classOptions());
        fillForm(s);
        openModal("studentModal");
      }
    }
    if (delId) {
      if (!confirm("Supprimer cet élève ?")) return;
      await deleteRow("students", delId);
      toast("Élève supprimé");
      await refresh();
    }
  });

  el("studentForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const parentName = el("fStudentParent").value.trim();
    const parentPhone = el("fStudentPhone").value.trim();
    const parentEmail = el("fStudentParentEmail")?.value.trim() || "";
    const payload = {
      name: el("fStudentName").value.trim(),
      matricule: el("fStudentMat").value.trim() || undefined,
      class_name: el("fStudentClass").value,
      parent_name: parentName,
      phone: parentPhone,
      monthly_fee: el("fStudentFee")?.value ? Number(el("fStudentFee").value) : null,
      status: "Actif",
    };
    try {
      // Le parent est créé/mis à jour automatiquement à partir de ces
      // informations — pas besoin de le saisir séparément dans "Parents / Tuteurs".
      payload.parent_id = await upsertParentForStudent({ name: parentName, phone: parentPhone, email: parentEmail }, payload.name);

      if (editingId) {
        await updateRow("students", editingId, payload);
        toast("Élève mis à jour — fiche parent synchronisée");
      } else {
        if (!payload.matricule) payload.matricule = "ELV-" + String(Date.now()).slice(-6);
        await insertRow("students", payload);
        toast("Élève enregistré — fiche parent créée automatiquement");
      }
      closeModal("studentModal");
      resetForm();
      await refresh();
    } catch (err) {
      toast("Erreur : " + err.message);
    }
  });

  el("exportStudentsExcel")?.addEventListener("click", () => exportExcel());
  el("exportStudentsWord")?.addEventListener("click", () => exportWord());
  el("importStudentsInput")?.addEventListener("change", (e) => importExcel(e.target.files[0]));
}

function exportExcel() {
  const rows = [
    ["Matricule", "Élève", "Classe", "Parent", "Téléphone", "Frais mensuel", "Statut"],
    ...(state.cache.students || []).map((s) => [s.matricule, s.name, s.class_name, s.parent_name, s.phone, s.monthly_fee || "", s.status]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Élèves");
  XLSX.writeFile(wb, "eleves.xlsx");
  toast("Export Excel téléchargé");
}

async function exportWord() {
  const students = state.cache.students || [];
  if (!students.length) {
    toast("Aucun élève à exporter.");
    return;
  }
  const rows = students.map((s) => ({
    "Matricule": s.matricule || "",
    "Élève": s.name || "",
    "Classe": s.class_name || "",
    "Parent": s.parent_name || "",
    "Téléphone": s.phone || "",
    "Frais mensuel": s.monthly_fee || "",
    "Statut": s.status || "",
  }));
  await exportStyledDocx("Élèves", rows, "eleves.docx");
}

function importExcel(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const wb = XLSX.read(e.target.result, { type: "array" });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
    let count = 0;
    for (const r of rows) {
      const name = r["Élève"] || r["Eleve"] || r["Nom et prénom"] || r["Nom"];
      if (!name) continue;
      const parentName = String(r["Parent"] || r["Tuteur"] || "");
      const phone = String(r["Téléphone"] || r["Telephone"] || "");
      try {
        const parentId = await upsertParentForStudent({ name: parentName, phone, email: String(r["Email parent"] || "") }, String(name));
        await insertRow("students", {
          matricule: String(r["Matricule"] || "ELV-" + String(Date.now() + count).slice(-6)),
          name: String(name),
          class_name: String(r["Classe"] || ""),
          parent_name: parentName,
          phone,
          parent_id: parentId,
          monthly_fee: r["Frais mensuel"] ? Number(r["Frais mensuel"]) : null,
          status: "Actif",
        });
        count++;
      } catch (_) {}
    }
    toast(count + " élève(s) importé(s)");
    await refresh();
  };
  reader.readAsArrayBuffer(file);
}
