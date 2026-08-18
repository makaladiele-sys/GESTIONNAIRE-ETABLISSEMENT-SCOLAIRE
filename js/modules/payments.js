// ==========================================================================
// FACTURATION & PAIEMENTS
// Paiement toujours rattaché à un élève réel + parent réel.
// ==========================================================================

import { listRows, insertRow, state } from "../state.js";
import {
  toast,
  openModal,
  closeModal,
  escapeHtml,
  fmtMoney
} from "../ui.js";

import { computeCollectionsRows } from "./feeCalc.js";

const el = (id) => document.getElementById(id);

export async function refresh() {

  if (!state.cache.students) {
    await listRows("students");
  }

  if (!state.cache.parents) {
    await listRows("parents");
  }

  if (!state.cache.classes) {
    await listRows("classes");
  }

  const payments = await listRows("payments", {
    orderBy: "created_at",
    ascending: false
  });

  const currency = state.school?.currency || "FCFA";

  const rows = computeCollectionsRows()
    .filter((r) => r.configured);

  const expected = rows.reduce(
    (a, r) => a + r.expected,
    0
  );

  const collected = rows.reduce(
    (a, r) => a + r.paid,
    0
  );

  const overdue = rows.reduce(
    (a, r) => a + Math.max(0, r.remaining),
    0
  );

  el("payDue") &&
    (el("payDue").textContent =
      fmtMoney(expected, currency));

  el("payPaid") &&
    (el("payPaid").textContent =
      fmtMoney(collected, currency));

  el("payUnpaid") &&
    (el("payUnpaid").textContent =
      fmtMoney(overdue, currency));

  renderTable(payments, currency);
}

function renderTable(payments, currency) {

  const rows =
    payments || state.cache.payments || [];

  const students =
    state.cache.students || [];

  const parents =
    state.cache.parents || [];

  el("paymentsBody").innerHTML =
    rows.map((p) => {

      const student =
        students.find(
          (s) => s.id === p.student_id
        );

      const parent =
        parents.find(
          (x) => x.id === p.parent_id
        );

      const due =
        Number(p.amount_due) || 0;

      const paid =
        Number(p.amount_paid) || 0;

      const rest =
        Math.max(0, due - paid);

      const status =
        rest <= 0
          ? "Payé"
          : paid > 0
          ? "Partiel"
          : "Impayé";

      return `
        <tr>
          <td>
            <b>${escapeHtml(
              student?.name ||
              p.student_name ||
              "—"
            )}</b>
          </td>

          <td>
            ${escapeHtml(
              parent?.name || "—"
            )}
          </td>

          <td>
            ${escapeHtml(
              p.reason || "Scolarité"
            )}
          </td>

          <td>
            ${fmtMoney(due, currency)}
          </td>

          <td>
            ${fmtMoney(paid, currency)}
          </td>

          <td>
            ${fmtMoney(rest, currency)}
          </td>

          <td>
            ${escapeHtml(
              p.payment_date || "—"
            )}
          </td>

          <td>
            <span class="badge ${
              status === "Payé"
                ? "green"
                : status === "Partiel"
                ? "orange"
                : "red"
            }">
              ${status}
            </span>
          </td>

          <td>
            <button
              class="btn btn-light btn-sm"
              data-receipt="${p.id}">
              🧾 Reçu
            </button>
          </td>
        </tr>
      `;
    }).join("") ||
    `
      <tr>
        <td colspan="9" class="empty">
          Aucun paiement enregistré.
        </td>
      </tr>
    `;
}

function studentOptions() {

  return (state.cache.students || [])
    .filter((s) => s.status === "Actif")
    .map((s) => {

      const parent =
        (state.cache.parents || [])
          .find(
            (p) => p.id === s.parent_id
          );

      return `
        <option value="${s.id}">
          ${escapeHtml(s.name)}
          ${s.class_name
            ? " — " + escapeHtml(s.class_name)
            : ""}
          ${parent
            ? " — Parent : " +
              escapeHtml(parent.name)
            : ""}
        </option>
      `;
    })
    .join("");
}

function updateAmountHint() {

  const hint =
    el("payAmountHint");

  if (!hint) return;

  const reason =
    el("fPayReason")?.value;

  const studentId =
    el("fPayStudent")?.value;

  if (!studentId) {
    hint.textContent = "";
    return;
  }

  const student =
    (state.cache.students || [])
      .find((s) => s.id === studentId);

  if (!student) return;

  if (reason !== "Scolarité") {

    hint.textContent =
      "Saisissez le montant à payer.";

    return;
  }

  const row =
    computeCollectionsRows()
      .find(
        (r) => r.student.id === studentId
      );

  if (!row || !row.configured) {

    hint.textContent =
      "Frais mensuel non configuré pour cet élève.";

    return;
  }

  const currency =
    state.school?.currency || "FCFA";

  if (row.remaining > 0) {

    hint.textContent =
      `Reste à payer : ${fmtMoney(
        row.remaining,
        currency
      )}`;

    el("fPayAmount").value =
      Math.round(row.remaining);

  } else {

    hint.textContent =
      "✓ Cet élève est à jour.";
  }
}

export function mount() {

  el("openAddPayment")
    ?.addEventListener("click", async () => {

      if (!state.cache.students) {
        await listRows("students");
      }

      if (!state.cache.parents) {
        await listRows("parents");
      }

      el("fPayStudent").innerHTML =
        studentOptions();

      el("paymentForm")?.reset();

      el("payAmountHint") &&
        (el("payAmountHint").textContent = "");

      openModal("paymentModal");
    });

  el("fPayStudent")
    ?.addEventListener(
      "change",
      updateAmountHint
    );

  el("fPayReason")
    ?.addEventListener(
      "change",
      updateAmountHint
    );

  // ------------------------------------------------------------------------
  // REÇU
  // ------------------------------------------------------------------------

  el("paymentsBody")
    ?.addEventListener("click", (e) => {

      const id =
        e.target.closest(
          "[data-receipt]"
        )?.dataset.receipt;

      if (!id) return;

      const p =
        (state.cache.payments || [])
          .find((x) => x.id === id);

      if (!p) return;

      const student =
        (state.cache.students || [])
          .find(
            (s) => s.id === p.student_id
          );

      const parent =
        (state.cache.parents || [])
          .find(
            (x) => x.id === p.parent_id
          );

      alert(
`REÇU DE PAIEMENT

Établissement : ${
  state.school?.name || ""
}

Parent : ${
  parent?.name || "—"
}

Élève : ${
  student?.name || p.student_name || "—"
}

Motif : ${
  p.reason || "Scolarité"
}

Montant payé : ${
  fmtMoney(
    p.amount_paid,
    state.school?.currency
  )
}

Date : ${
  p.payment_date || "—"
}

Mode : ${
  p.method || "—"
}

Référence : ${
  p.reference ||
  p.id.slice(0, 8).toUpperCase()
}`
      );
    });

  // ------------------------------------------------------------------------
  // ENREGISTREMENT
  // ------------------------------------------------------------------------

  el("paymentForm")
    ?.addEventListener(
      "submit",
      async (e) => {

        e.preventDefault();

        const studentId =
          el("fPayStudent").value;

        const reason =
          el("fPayReason").value;

        const amount =
          Number(
            el("fPayAmount").value
          ) || 0;

        if (!studentId) {
          toast("Sélectionnez un élève.");
          return;
        }

        if (amount <= 0) {
          toast("Le montant doit être supérieur à 0.");
          return;
        }

        const student =
          (state.cache.students || [])
            .find(
              (s) => s.id === studentId
            );

        if (!student) {
          toast("Élève introuvable.");
          return;
        }

        // Parent réel de l'élève
        const parent =
          (state.cache.parents || [])
            .find(
              (p) => p.id === student.parent_id
            );

        // Montant réellement dû avant paiement
        let amountDue = amount;

        if (reason === "Scolarité") {

          const row =
            computeCollectionsRows()
              .find(
                (r) =>
                  r.student.id === studentId
              );

          if (row) {
            amountDue = row.remaining;

            if (amountDue <= 0) {
              toast(
                "Cet élève est déjà à jour."
              );
              return;
            }

            if (amount > amountDue) {
              toast(
                `Le montant ne peut pas dépasser ${fmtMoney(
                  amountDue,
                  state.school?.currency || "FCFA"
                )}.`
              );
              return;
            }
          }
        }

        const status =
          amount >= amountDue
            ? "Payé"
            : "Partiel";

        const payload = {

          // Nouvelle relation réelle
          student_id: student.id,

          parent_id:
            parent?.id || null,

          // Compatibilité avec anciennes données
          student_name:
            student.name,

          reason,

          // Dette avant le paiement
          amount_due: amountDue,

          // Argent réellement reçu
          amount_paid: amount,

          method:
            el("fPayMethod").value,

          payment_date:
            new Date()
              .toISOString()
              .slice(0, 10),

          status,

          reference:
            "PAY-" +
            Date.now()
        };

        try {

          await insertRow(
            "payments",
            payload
          );

          toast(
            status === "Payé"
              ? "Paiement enregistré — élève à jour."
              : "Paiement partiel enregistré."
          );

          closeModal(
            "paymentModal"
          );

          await refresh();

        } catch (err) {

          console.error(err);

          toast(
            "Erreur : " +
            err.message
          );
        }
      }
    );
}
