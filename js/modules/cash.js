// ==========================================================================
// Caisse & Dépenses
// ==========================================================================
import { listRows, insertRow, state } from "../state.js";
import { toast, openModal, closeModal, escapeHtml, fmtMoney } from "../ui.js";

const el = (id) => document.getElementById(id);

export async function refresh() {
  const rows = await listRows("expenses", { orderBy: "op_date", ascending: false });
  const currency = state.school?.currency || "FCFA";
  const income = rows.filter((r) => r.type === "Recette").reduce((a, r) => a + Number(r.amount), 0);
  const outcome = rows.filter((r) => r.type === "Dépense").reduce((a, r) => a + Number(r.amount), 0);
  el("cashBalance") && (el("cashBalance").textContent = fmtMoney(income - outcome, currency));
  el("cashIncome") && (el("cashIncome").textContent = fmtMoney(income, currency));
  el("cashOutcome") && (el("cashOutcome").textContent = fmtMoney(outcome, currency));

  el("cashBody").innerHTML =
    rows
      .map(
        (r) => `<tr>
      <td>${escapeHtml(r.op_date || "—")}</td>
      <td><span class="badge ${r.type === "Recette" ? "green" : "red"}">${escapeHtml(r.type)}</span></td>
      <td>${escapeHtml(r.category || "—")}</td>
      <td>${escapeHtml(r.reason || "—")}</td>
      <td>${fmtMoney(r.amount, currency)}</td>
      <td>${escapeHtml(r.created_by || state.profile?.full_name || "—")}</td>
    </tr>`
      )
      .join("") || `<tr><td colspan="6" class="empty">Aucune opération de caisse.</td></tr>`;
}

export function mount() {
  el("openAddCash")?.addEventListener("click", () => {
    el("cashForm")?.reset();
    const d = el("fCashDate");
    if (d) d.value = new Date().toISOString().slice(0, 10);
    openModal("cashModal");
  });

  el("cashForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      type: el("fCashType").value,
      category: el("fCashCategory").value.trim(),
      reason: el("fCashReason").value.trim(),
      amount: Number(el("fCashAmount").value) || 0,
      op_date: el("fCashDate").value,
      created_by: state.profile?.full_name || state.profile?.email,
    };
    try {
      await insertRow("expenses", payload);
      toast("Opération enregistrée");
      closeModal("cashModal");
      await refresh();
    } catch (err) {
      toast("Erreur : " + err.message);
    }
  });
}
