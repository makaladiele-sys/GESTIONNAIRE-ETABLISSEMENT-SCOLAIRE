// ==========================================================================
// Parents / Tuteurs
// ==========================================================================
import { listRows, insertRow, updateRow, deleteRow, state } from "../state.js";
import { toast, openModal, closeModal, escapeHtml, fmtMoney } from "../ui.js";

const el = (id) => document.getElementById(id);
let editingId = null;

export async function refresh() {
  await listRows("parents", { orderBy: "name", ascending: true });
  renderTable();
}

function renderTable() {
  const q = (el("parentSearch")?.value || "").toLowerCase();
  const rows = (state.cache.parents || []).filter((p) => (p.name + " " + (p.phone || "") + " " + (p.children || "")).toLowerCase().includes(q));
  el("parentsBody").innerHTML =
    rows
      .map(
        (p) => `<tr>
      <td><b>${escapeHtml(p.name)}</b></td>
      <td>${escapeHtml(p.phone || "—")}</td>
      <td>${escapeHtml(p.email || "—")}</td>
      <td>${escapeHtml(p.children || "—")}</td>
      <td>${fmtMoney(p.balance, state.school?.currency)}</td>
      <td>
        <button class="btn btn-light btn-sm" data-edit="${p.id}">✏️</button>
        <button class="btn btn-danger btn-sm" data-del="${p.id}">🗑️</button>
      </td>
    </tr>`
      )
      .join("") || `<tr><td colspan="6" class="empty">Aucun parent enregistré.</td></tr>`;
}

function resetForm() {
  editingId = null;
  el("parentForm")?.reset();
  el("parentModalTitle") && (el("parentModalTitle").textContent = "Nouveau parent / tuteur");
}
function fillForm(p) {
  editingId = p.id;
  el("parentModalTitle") && (el("parentModalTitle").textContent = "Modifier le parent");
  el("fParentName").value = p.name || "";
  el("fParentPhone").value = p.phone || "";
  el("fParentEmail").value = p.email || "";
  el("fParentChildren").value = p.children || "";
}

export function mount() {
  el("parentSearch")?.addEventListener("input", renderTable);
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
      if (!confirm("Supprimer ce parent ?")) return;
      await deleteRow("parents", delId);
      toast("Parent supprimé");
      await refresh();
    }
  });

  el("parentForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      name: el("fParentName").value.trim(),
      phone: el("fParentPhone").value.trim(),
      email: el("fParentEmail").value.trim(),
      children: el("fParentChildren").value.trim(),
    };
    try {
      if (editingId) {
        await updateRow("parents", editingId, payload);
        toast("Parent mis à jour");
      } else {
        await insertRow("parents", { ...payload, balance: 0 });
        toast("Parent enregistré");
      }
      closeModal("parentModal");
      resetForm();
      await refresh();
    } catch (err) {
      toast("Erreur : " + err.message);
    }
  });
}
