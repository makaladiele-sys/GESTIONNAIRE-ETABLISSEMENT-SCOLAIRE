// ==========================================================================
// Parents / Tuteurs
// --------------------------------------------------------------------------
// Chaque parent est lié à un ou plusieurs élèves réels (students.parent_id).
// Le frais mensuel reste défini par élève (students.monthly_fee) — seule
// source de vérité partagée avec Recouvrement et Facturation & Paiements
// (js/modules/feeCalc.js) — mais on le rend éditable directement depuis la
// fiche du parent, puisque c'est lui qui règle la scolarité.
// Le "Solde" affiché est donc calculé en temps réel (Attendu − Payé, cumulé
// sur tous les enfants du parent), connu dès l'inscription, sans attendre
// la page Recouvrement.
// ==========================================================================
import { listRows, insertRow, updateRow, deleteRow, state } from "../state.js";
import { toast, openModal, closeModal, escapeHtml, fmtMoney } from "../ui.js";
import { computeCollectionsRows } from "./feeCalc.js";

const el = (id) => document.getElementById(id);
let editingId = null;

export async function refresh() {
  await listRows("parents", { orderBy: "name", ascending: true });
  if (!state.cache.students) await listRows("students");
  if (!state.cache.classes) await listRows("classes");
  renderTable();
}

// Élèves liés à un parent : lien réel (parent_id) en priorité, avec repli
// sur l'ancien texte libre "parent_name" pour les données existantes non
// encore migrées.
function childrenOf(parent) {
  const students = state.cache.students || [];
  const linked = students.filter((s) => s.parent_id === parent.id);
  if (linked.length) return linked;
  const name = (parent.name || "").trim().toLowerCase();
  if (!name) return [];
  return students.filter((s) => (s.parent_name || "").trim().toLowerCase() === name);
}

function soldeOf(parent) {
  const ids = new Set(childrenOf(parent).map((s) => s.id));
  if (!ids.size) return null;
  const rows = computeCollectionsRows().filter((r) => ids.has(r.student.id));
  const expected = rows.reduce((a, r) => a + r.expected, 0);
  const paid = rows.reduce((a, r) => a + r.paid, 0);
  return { expected, paid, remaining: Math.max(0, expected - paid), configured: rows.some((r) => r.configured) };
}

function renderTable() {
  const q = (el("parentSearch")?.value || "").toLowerCase();
  const currency = state.school?.currency || "FCFA";
  const rows = (state.cache.parents || []).filter((p) => {
    const names = childrenOf(p).map((s) => s.name).join(" ");
    return (p.name + " " + (p.phone || "") + " " + names).toLowerCase().includes(q);
  });
  el("parentsBody").innerHTML =
    rows
      .map((p) => {
        const kids = childrenOf(p);
        const solde = soldeOf(p);
        const soldeCell = !kids.length
          ? '<span class="muted">—</span>'
          : !solde.configured
          ? '<span class="muted">Frais non défini</span>'
          : `<b>${fmtMoney(solde.remaining, currency)}</b> <span class="muted">restant</span>`;
        return `<tr>
      <td><b>${escapeHtml(p.name)}</b></td>
      <td>${escapeHtml(p.phone || "—")}</td>
      <td>${escapeHtml(p.email || "—")}</td>
      <td>${kids.length ? kids.map((s) => escapeHtml(s.name)).join(", ") : '<span class="muted">Aucun élève lié</span>'}</td>
      <td>${soldeCell}</td>
      <td>
        <button class="btn btn-light btn-sm" data-edit="${p.id}">✏️</button>
        <button class="btn btn-danger btn-sm" data-del="${p.id}">🗑️</button>
      </td>
    </tr>`;
      })
      .join("") || `<tr><td colspan="6" class="empty">Aucun parent enregistré.</td></tr>`;
}

function childOptions(selectedIds) {
  const students = state.cache.students || [];
  return (
    students
      .map(
        (s) =>
          `<option value="${s.id}" ${selectedIds.has(s.id) ? "selected" : ""}>${escapeHtml(s.name)}${s.class_name ? " — " + escapeHtml(s.class_name) : ""}</option>`
      )
      .join("") || `<option disabled>Aucun élève enregistré — ajoutez d'abord l'élève dans "Élèves"</option>`
  );
}

function renderFeeRows() {
  const wrap = el("fParentFeesWrap");
  if (!wrap) return;
  const sel = el("fParentChildren");
  const ids = [...(sel?.selectedOptions || [])].map((o) => o.value);
  const students = state.cache.students || [];
  const currency = state.school?.currency || "FCFA";
  if (!ids.length) {
    wrap.innerHTML = "";
    return;
  }
  wrap.innerHTML =
    `<label>Frais mensuel par élève (${currency})</label>` +
    `<div class="form-grid">` +
    ids
      .map((id) => {
        const s = students.find((x) => x.id === id);
        if (!s) return "";
        const val = Number(s.monthly_fee) > 0 ? s.monthly_fee : "";
        return `<div class="form-group">
          <label style="font-weight:400">${escapeHtml(s.name)}</label>
          <input type="number" min="0" step="1" class="form-control" data-child-fee="${s.id}" value="${val}" placeholder="Tarif de la classe">
        </div>`;
      })
      .join("") +
    `</div>`;
}

function resetForm() {
  editingId = null;
  el("parentForm")?.reset();
  el("parentModalTitle") && (el("parentModalTitle").textContent = "Nouveau parent / tuteur");
  el("fParentChildren") && (el("fParentChildren").innerHTML = childOptions(new Set()));
  renderFeeRows();
}

function fillForm(p) {
  editingId = p.id;
  el("parentModalTitle") && (el("parentModalTitle").textContent = "Modifier le parent");
  el("fParentName").value = p.name || "";
  el("fParentPhone").value = p.phone || "";
  el("fParentEmail").value = p.email || "";
  const selectedIds = new Set(childrenOf(p).map((s) => s.id));
  el("fParentChildren") && (el("fParentChildren").innerHTML = childOptions(selectedIds));
  renderFeeRows();
}

export function mount() {
  el("parentSearch")?.addEventListener("input", renderTable);
  el("fParentChildren")?.addEventListener("change", renderFeeRows);

  el("openAddParent")?.addEventListener("click", () => {
    resetForm();
    openModal("parentModal");
  });

  el("parentsBody")?.addEventListener("click", async (e) => {
    const editId = e.target.closest("[data-edit]")?.dataset.edit;
    const delId = e.target.closest("[data-del]")?.dataset.del;
    if (editId) {
      const p = (state.cache.parents || []).find((x) => x.id === editId);
      if (p) {
        fillForm(p);
        openModal("parentModal");
      }
    }
    if (delId) {
      if (!confirm("Supprimer ce parent ? Les élèves liés ne seront pas supprimés.")) return;
      await deleteRow("parents", delId);
      toast("Parent supprimé");
      await refresh();
    }
  });

  el("parentForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    // Élève optionnel ici : un parent peut être créé avant d'inscrire son
    // enfant. Dans le cas normal, c'est la fiche élève qui crée/lie le
    // parent automatiquement (voir js/modules/students.js).
    const selectedIds = new Set([...(el("fParentChildren")?.selectedOptions || [])].map((o) => o.value));
    const payload = {
      name: el("fParentName").value.trim(),
      phone: el("fParentPhone").value.trim(),
      email: el("fParentEmail").value.trim(),
      children: (state.cache.students || [])
        .filter((s) => selectedIds.has(s.id))
        .map((s) => s.name)
        .join(", "),
    };
    try {
      let parentId = editingId;
      if (editingId) {
        await updateRow("parents", editingId, payload);
      } else {
        const created = await insertRow("parents", { ...payload, balance: 0 });
        parentId = created.id;
      }

      // Délier les élèves qui étaient rattachés à ce parent mais ont été
      // décochés dans le formulaire.
      const previouslyLinked = (state.cache.students || []).filter((s) => s.parent_id === parentId);
      for (const s of previouslyLinked) {
        if (!selectedIds.has(s.id)) await updateRow("students", s.id, { parent_id: null });
      }

      // Lier les élèves sélectionnés + mettre à jour leur frais mensuel et
      // leurs coordonnées de contact depuis ce formulaire.
      for (const id of selectedIds) {
        const feeInput = document.querySelector(`[data-child-fee="${id}"]`);
        const fee = feeInput && feeInput.value !== "" ? Number(feeInput.value) : null;
        await updateRow("students", id, {
          parent_id: parentId,
          parent_name: payload.name,
          phone: payload.phone,
          monthly_fee: fee,
        });
      }

      toast(editingId ? "Parent mis à jour" : "Parent enregistré");
      closeModal("parentModal");
      resetForm();
      await listRows("students");
      await refresh();
    } catch (err) {
      toast("Erreur : " + err.message);
    }
  });
}
