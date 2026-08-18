// ==========================================================================
// CALCUL FINANCIER — source unique pour Recouvrement, Parents et Paiements
// ==========================================================================

import { state } from "../state.js";

export function monthsElapsed(enrolledOn) {
  if (!enrolledOn) return 1;

  const start = new Date(enrolledOn);
  const now = new Date();

  const months =
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth()) +
    1;

  return Math.max(1, months);
}

export function computeCollectionsRows() {
  const students = (state.cache.students || []).filter(
    (s) => s.status === "Actif"
  );

  const classes = state.cache.classes || [];
  const payments = state.cache.payments || [];

  const feeByClass = {};

  classes.forEach((c) => {
    feeByClass[c.name] = Number(c.monthly_fee) || 0;
  });

  // IMPORTANT :
  // On utilise maintenant student_id et non student_name.
  const paidByStudent = {};
  const lastMethodByStudent = {};

  payments
    .filter((p) => p.reason === "Scolarité")
    .forEach((p) => {
      const studentId = p.student_id;

      if (!studentId) return;

      paidByStudent[studentId] =
        (paidByStudent[studentId] || 0) +
        Number(p.amount_paid || 0);

      if (!(studentId in lastMethodByStudent)) {
        lastMethodByStudent[studentId] = p.method;
      }
    });

  return students.map((s) => {

    // Le tarif individuel de l'élève est prioritaire.
    const individualFee = Number(s.monthly_fee) || 0;

    // Sinon on prend le tarif de la classe.
    const classFee = feeByClass[s.class_name] || 0;

    const fee = individualFee > 0 ? individualFee : classFee;

    const months = monthsElapsed(s.enrolled_on);

    const expected = fee * months;

    const paid = paidByStudent[s.id] || 0;

    const remaining = Math.max(0, expected - paid);

    return {
      student: s,
      fee,
      months,
      expected,
      paid,
      remaining,
      lastMethod: lastMethodByStudent[s.id] || null,
      configured: fee > 0
    };
  });
}

export function collectionsRowFor(studentId) {
  return (
    computeCollectionsRows().find(
      (r) => r.student.id === studentId
    ) || null
  );
}
