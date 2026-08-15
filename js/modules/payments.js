// ==========================================================================
// Facturation & Paiements
// ==========================================================================
import { listRows, insertRow, state } from "../state.js";
import { toast, openModal, closeModal, escapeHtml, fmtMoney } from "../ui.js";

const el = (id) => document.getElementById(id);

export async function refresh() {
  if (!state.cache.students) await listRows("students");
  const payments = await listRows("payments", { orderBy: "created_at", ascending: false });
  const currency = state.school?.currency || "FCFA";

  const due = payments.reduce((a, p) => a + Number(p.amount_due || 0), 0);
  const paid = payments.reduce((a, p) => a + Number(p.amount_paid || 0), 0);
  el("payDue") && (el("payDue").textContent = fmtMoney(due, currency));
  el("payPaid") && (el("payPaid").textContent = fmtMoney(paid, currency));
  el("payUnpaid") && (el("payUnpaid").textContent = fmtMoney(due - paid, currency));

  renderTable(payments, currency);
}

function renderTable(payments, currency) {
  const rows = payments || state.cache.payments || [];
  el("paymentsBody").innerHTML =
    rows
      .map((p) => {
        const rest = Number(p.amount_due) - Number(p.amount_paid);
        return `<tr>
        <td>${escapeHtml(p.student_name)}</td>
        <td>${escapeHtml(p.reason)}</td>
        <td>${fmtMoney(p.amount_due, currency)}</td>
        <td>${fmtMoney(p.amount_paid, currency)}</td>
        <td>${fmtMoney(rest, currency)}</td>
        <td>${escapeHtml(p.payment_date || "—")}</td>
        <td><span class="badge ${p.status === "Payé" ? "green" : rest > 0 ? "orange" : "green"}">${escapeHtml(p.status)}</span></td>
        <td><button class="btn btn-light btn-sm" data-receipt="${p.id}">🧾 Reçu</button></td>
      </tr>`;
      })
      .join("") || `<tr><td colspan="8" class="empty">Aucun paiement enregistré.</td></tr>`;
}

function studentOptions() {
  return (state.cache.students || []).map((s) => `<option>${escapeHtml(s.name)}</option>`).join("");
}

export function mount() {
  el("openAddPayment")?.addEventListener("click", () => {
    el("fPayStudent") && (el("fPayStudent").innerHTML = studentOptions());
    el("paymentForm")?.reset();
    openModal("paymentModal");
  });

  el("paymentsBody")?.addEventListener("click", (e) => {
    const id = e.target.closest("[data-receipt]")?.dataset.receipt;
    if (!id) return;
    const p = (state.cache.payments || []).find((x) => x.id === id);
    if (!p) return;
    alert(
      `REÇU DE PAIEMENT\n\nÉtablissement : ${state.school?.name || ""}\nÉlève : ${p.student_name}\nMotif : ${p.reason}\nMontant : ${fmtMoney(p.amount_paid, state.school?.currency)}\nDate : ${p.payment_date}\nRéférence : ${p.id.slice(0, 8).toUpperCase()}`
    );
  });

  el("paymentForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const amount = Number(el("fPayAmount").value) || 0;
    const payload = {
      student_name: el("fPayStudent").value,
      reason: el("fPayReason").value,
      amount_due: amount,
      amount_paid: amount,
      method: el("fPayMethod").value,
      payment_date: new Date().toISOString().slice(0, 10),
      status: "Payé",
    };
    try {
      await insertRow("payments", payload);
      toast("Paiement enregistré — reçu disponible");
      closeModal("paymentModal");
      await refresh();
    } catch (err) {
      toast("Erreur : " + err.message);
    }
  });
}
