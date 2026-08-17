// ==========================================================================
// Facturation & Paiements — les totaux "scolarité" utilisent le même calcul
// que Recouvrement (feeCalc.js), pour rester toujours synchronisés. Le
// montant suggéré à l'encaissement est aussi calculé à partir de ce solde.
// ==========================================================================
import { listRows, insertRow, state } from "../state.js";
import { toast, openModal, closeModal, escapeHtml, fmtMoney } from "../ui.js";
import { computeCollectionsRows } from "./feeCalc.js";

const el = (id) => document.getElementById(id);

export async function refresh() {
  if (!state.cache.students) await listRows("students");
  if (!state.cache.classes) await listRows("classes");
  const payments = await listRows("payments", { orderBy: "created_at", ascending: false });
  const currency = state.school?.currency || "FCFA";

  // Mêmes totaux que la page Recouvrement (frais mensuel × mois écoulés,
  // face aux paiements motif "Scolarité").
  const rows = computeCollectionsRows().filter((r) => r.configured);
  const expected = rows.reduce((a, r) => a + r.expected, 0);
  const collected = rows.reduce((a, r) => a + r.paid, 0);
  const overdue = rows.reduce((a, r) => a + Math.max(0, r.remaining), 0);

  el("payDue") && (el("payDue").textContent = fmtMoney(expected, currency));
  el("payPaid") && (el("payPaid").textContent = fmtMoney(collected, currency));
  el("payUnpaid") && (el("payUnpaid").textContent = fmtMoney(overdue, currency));

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

function updateAmountHint() {
  const hint = el("payAmountHint");
  if (!hint) return;
  const reason = el("fPayReason")?.value;
  const studentName = el("fPayStudent")?.value;
  if (reason !== "Scolarité" || !studentName) {
    hint.textContent = "";
    return;
  }
  const row = computeCollectionsRows().find((r) => r.student.name === studentName);
  if (!row || !row.configured) {
    hint.textContent = "Frais mensuel non configuré pour la classe de cet élève (voir Classes).";
    return;
  }
  const currency = state.school?.currency || "FCFA";
  if (row.remaining > 0) {
    hint.textContent = `Reste dû (scolarité, ${row.months} mois écoulé(s)) : ${fmtMoney(row.remaining, currency)} — montant pré-rempli, modifiable.`;
    el("fPayAmount").value = Math.round(row.remaining);
  } else {
    hint.textContent = "Cet élève est à jour sur sa scolarité.";
  }
}

export function mount() {
  el("openAddPayment")?.addEventListener("click", () => {
    el("fPayStudent") && (el("fPayStudent").innerHTML = studentOptions());
    el("paymentForm")?.reset();
    el("payAmountHint") && (el("payAmountHint").textContent = "");
    openModal("paymentModal");
    updateAmountHint();
  });

  el("fPayStudent")?.addEventListener("change", updateAmountHint);
  el("fPayReason")?.addEventListener("change", updateAmountHint);

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
