// ==========================================================================
// Facturation & Paiements — les totaux "scolarité" utilisent le même calcul
// que Recouvrement (feeCalc.js), pour rester toujours synchronisés. Le
// montant suggéré à l'encaissement est aussi calculé à partir de ce solde.
//
// Les paiements sont rattachés à l'ID réel de l'élève (student_id), pas à
// son nom en texte libre — deux élèves peuvent porter le même nom, ce qui
// mélangeait leurs paiements avant (voir sql/10_payments_student_link.sql).
//
// Le reçu (🧾) ouvre un modal imprimable via window.print() — compatible
// avec toute imprimante installée comme imprimante système (USB, réseau,
// et Bluetooth déjà appairée en tant qu'imprimante). Pour les petites
// imprimantes thermiques Bluetooth qui ne s'installent pas comme
// imprimante système (type ATPOS), l'appli Android RawBT capte
// l'impression du site et la reformate pour l'imprimante thermique.
//
// Design du reçu : voir css/receipt.css (bandeau accent, badge de statut,
// tampon "PAYÉ" en filigrane, code-barres en CSS pur).
// ==========================================================================
import { listRows, insertRow, updateRow, deleteRow, state } from "../state.js";
import { toast, openModal, closeModal, escapeHtml, fmtMoney } from "../ui.js";
import { computeCollectionsRows } from "./feeCalc.js";

const el = (id) => document.getElementById(id);
let editingId = null;

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

function studentById(id) {
  return (state.cache.students || []).find((s) => s.id === id);
}

function renderTable(payments, currency) {
  const rows = payments || state.cache.payments || [];
  el("paymentsBody").innerHTML =
    rows
      .map((p) => {
        const rest = Number(p.amount_due) - Number(p.amount_paid);
        const s = p.student_id ? studentById(p.student_id) : null;
        const parentName = s?.parent_name || "—";
        const displayStatus = rest > 0 ? "Partiel" : p.status;
        return `<tr>
        <td>${escapeHtml(p.student_name)}</td>
        <td>${escapeHtml(parentName)}</td>
        <td>${escapeHtml(p.reason)}</td>
        <td>${fmtMoney(p.amount_due, currency)}</td>
        <td>${fmtMoney(p.amount_paid, currency)}</td>
        <td>${fmtMoney(rest, currency)}</td>
        <td>${escapeHtml(p.payment_date || "—")}</td>
        <td><span class="badge ${rest > 0 ? "orange" : "green"}">${escapeHtml(displayStatus)}</span></td>
        <td><button class="btn btn-light btn-sm" data-receipt="${p.id}">🧾 Reçu</button></td>
        <td>
          <button class="btn btn-light btn-sm" data-edit="${p.id}">✏️</button>
          <button class="btn btn-danger btn-sm" data-del="${p.id}">🗑️</button>
        </td>
      </tr>`;
      })
      .join("") || `<tr><td colspan="10" class="empty">Aucun paiement enregistré.</td></tr>`;
}

function studentOptions(selectedId) {
  return (state.cache.students || [])
    .map((s) => `<option value="${s.id}" ${s.id === selectedId ? "selected" : ""}>${escapeHtml(s.name)}${s.class_name ? " — " + escapeHtml(s.class_name) : ""}</option>`)
    .join("");
}

function updateParentLine() {
  const line = el("payParentLine");
  if (!line) return;
  const s = studentById(el("fPayStudent")?.value);
  line.innerHTML = s?.parent_name
    ? `<span class="muted">Parent / tuteur : <b>${escapeHtml(s.parent_name)}</b>${s.phone ? " — " + escapeHtml(s.phone) : ""}</span>`
    : `<span class="muted">Aucun parent lié à cet élève (voir Parents / Tuteurs)</span>`;
}

function updateAmountHint() {
  const hint = el("payAmountHint");
  if (!hint) return;
  const reason = el("fPayReason")?.value;
  const studentId = el("fPayStudent")?.value;
  if (reason !== "Scolarité" || !studentId) {
    hint.textContent = "";
    return;
  }
  const row = computeCollectionsRows().find((r) => r.student.id === studentId);
  if (!row || !row.configured) {
    hint.textContent = "Frais mensuel non configuré pour la classe de cet élève (voir Classes).";
    return;
  }
  const currency = state.school?.currency || "FCFA";
  if (row.remaining > 0) {
    hint.textContent = `Reste dû (scolarité, ${row.months} mois écoulé(s)) : ${fmtMoney(row.remaining, currency)} — montant pré-rempli, modifiable.`;
    if (!editingId) el("fPayAmount").value = Math.round(row.remaining);
  } else if (row.remaining < 0) {
    hint.textContent = `Cet élève est à jour et a une avance de ${fmtMoney(-row.remaining, currency)}.`;
  } else {
    hint.textContent = "Cet élève est à jour sur sa scolarité.";
  }
}

function resetForm() {
  editingId = null;
  el("paymentModalTitle") && (el("paymentModalTitle").textContent = "Encaisser un paiement");
  el("fPayStudent") && (el("fPayStudent").innerHTML = studentOptions(null));
  el("paymentForm")?.reset();
  el("payAmountHint") && (el("payAmountHint").textContent = "");
  updateParentLine();
}

function fillForm(p) {
  editingId = p.id;
  el("paymentModalTitle") && (el("paymentModalTitle").textContent = "Modifier le paiement");
  el("fPayStudent") && (el("fPayStudent").innerHTML = studentOptions(p.student_id));
  el("fPayReason").value = p.reason;
  el("fPayAmount").value = p.amount_paid;
  el("fPayMethod").value = p.method;
  updateParentLine();
  updateAmountHint();
}

// --------------------------------------------------------------------------
// Reçu imprimable — design : bandeau accent, badge de statut, tampon
// "PAYÉ" en filigrane quand le solde est soldé, code-barres en CSS.
// Styles dans css/receipt.css.
// --------------------------------------------------------------------------

function buildReceiptHtml(p) {
  const currency = state.school?.currency || "FCFA";
  const s = p.student_id ? studentById(p.student_id) : null;
  const rest = Number(p.amount_due) - Number(p.amount_paid);
  const isPaid = rest <= 0;
  const reference = (p.id || "").slice(0, 8).toUpperCase();
  const dateStr = p.payment_date
    ? new Date(p.payment_date).toLocaleDateString("fr-FR")
    : new Date().toLocaleDateString("fr-FR");
  const timeStr = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  const contactLines = [state.school?.phone, state.school?.email].filter(Boolean).join(" · ");

  const row = (label, value, big = false) => `
    <div class="receipt-row${big ? " receipt-row-big" : ""}">
      <span class="receipt-label">${escapeHtml(label)}</span>
      <span class="receipt-fill"></span>
      <span class="receipt-value">${value}</span>
    </div>
  `;

  return `
    <div class="receipt">
      <div class="receipt-accent"></div>
      ${isPaid ? `<div class="receipt-stamp">Payé</div>` : ""}

      <div class="receipt-head">
        <div class="receipt-icon">🧾</div>
        <b class="receipt-school">${escapeHtml(state.school?.name || "Établissement")}</b>
        ${contactLines ? `<div class="receipt-contact">${escapeHtml(contactLines)}</div>` : ""}
        ${state.school?.address ? `<div class="receipt-contact">${escapeHtml(state.school.address)}</div>` : ""}
      </div>

      <div class="receipt-title-row">
        <div class="receipt-title">Reçu de paiement</div>
        <span class="receipt-badge ${isPaid ? "receipt-badge-green" : "receipt-badge-orange"}">
          ${isPaid ? "Payé" : "Partiel"}
        </span>
      </div>

      <div class="receipt-meta">
        <span>N° ${escapeHtml(reference)}</span>
        <span>${escapeHtml(dateStr)} · ${escapeHtml(timeStr)}</span>
      </div>

      <div class="receipt-sep"></div>

      ${row("Élève", escapeHtml(p.student_name || "—"))}
      ${row("Classe", escapeHtml(s?.class_name || "—"))}
      ${row("Parent / Tuteur", escapeHtml(s?.parent_name || "—"))}

      <div class="receipt-sep"></div>

      ${row("Motif", escapeHtml(p.reason || "—"))}
      ${row("Montant dû", fmtMoney(p.amount_due, currency))}
      ${row("Reste", fmtMoney(Math.max(0, rest), currency))}
      ${row("Moyen", escapeHtml(p.method || "—"))}

      <div class="receipt-sep receipt-sep-bold"></div>

      ${row("MONTANT PAYÉ", `<b>${fmtMoney(p.amount_paid, currency)}</b>`, true)}

      <div class="receipt-sep"></div>

      <div class="receipt-footer">
        <div class="receipt-thanks">Merci de votre confiance</div>
        <div class="receipt-barcode" aria-hidden="true"></div>
        <div class="receipt-ref-small">${escapeHtml(reference)}</div>
      </div>
    </div>
  `;
}

function openReceipt(paymentId) {
  const p = (state.cache.payments || []).find((x) => x.id === paymentId);
  if (!p) return;
  const box = el("receiptContent");
  if (box) box.innerHTML = buildReceiptHtml(p);
  openModal("receiptModal");
}

export function mount() {
  el("openAddPayment")?.addEventListener("click", () => {
    resetForm();
    openModal("paymentModal");
    updateAmountHint();
  });

  el("printReceiptBtn")?.addEventListener("click", () => {
    window.print();
  });

  el("fPayStudent")?.addEventListener("change", () => {
    updateParentLine();
    updateAmountHint();
  });
  el("fPayReason")?.addEventListener("change", updateAmountHint);

  el("paymentsBody")?.addEventListener("click", async (e) => {
    const receiptId = e.target.closest("[data-receipt]")?.dataset.receipt;
    const editId = e.target.closest("[data-edit]")?.dataset.edit;
    const delId = e.target.closest("[data-del]")?.dataset.del;

    if (receiptId) {
      openReceipt(receiptId);
    }

    if (editId) {
      const p = (state.cache.payments || []).find((x) => x.id === editId);
      if (p) {
        fillForm(p);
        openModal("paymentModal");
      }
    }

    if (delId) {
      if (!confirm("Supprimer ce paiement ? Les totaux Attendu/Encaissé/En retard seront recalculés immédiatement.")) return;
      try {
        await deleteRow("payments", delId);
        toast("Paiement supprimé");
        await refresh();
      } catch (err) {
        toast("Erreur : " + err.message);
      }
    }
  });

  el("paymentForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const studentId = el("fPayStudent").value;
    const s = studentById(studentId);
    if (!s) {
      toast("Sélectionnez un élève");
      return;
    }
    const reason = el("fPayReason").value;
    const amountPaid = Number(el("fPayAmount").value) || 0;

    // "Montant dû" = la mensualité convenue à l'inscription (frais propre à
    // l'élève, sinon celui de sa classe) — PAS le montant réellement payé.
    // Ainsi, un paiement partiel (ex: 3 000 F payés sur 5 000 F dus) affiche
    // bien un "Reste" de 2 000 F au lieu de 0.
    let amountDue = amountPaid;
    if (reason === "Scolarité") {
      const row = computeCollectionsRows().find((r) => r.student.id === studentId);
      amountDue = row && row.fee > 0 ? row.fee : amountPaid;
    }

    const payload = {
      student_id: studentId,
      student_name: s.name,
      reason,
      amount_due: amountDue,
      amount_paid: amountPaid,
      method: el("fPayMethod").value,
      status: amountPaid >= amountDue ? "Payé" : "Partiel",
    };
    const isNewPayment = !editingId;
    try {
      let saved;
      if (editingId) {
        saved = await updateRow("payments", editingId, payload);
        toast("Paiement mis à jour");
      } else {
        saved = await insertRow("payments", { ...payload, payment_date: new Date().toISOString().slice(0, 10) });
        toast("Paiement enregistré — reçu disponible");
      }
      closeModal("paymentModal");
      resetForm();
      await refresh();
      // Ouvre directement le reçu imprimable après un nouvel encaissement.
      if (isNewPayment && saved?.id) openReceipt(saved.id);
    } catch (err) {
      toast("Erreur : " + err.message);
    }
  });
}
