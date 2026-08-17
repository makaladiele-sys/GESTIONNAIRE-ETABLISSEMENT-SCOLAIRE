// ==========================================================================
// Calcul partagé "attendu vs recouvré" — utilisé par Recouvrement ET
// Facturation & Paiements, pour que les deux pages affichent toujours
// exactement les mêmes chiffres (une seule source de vérité).
// ==========================================================================
import { state } from "../state.js";

export function monthsElapsed(enrolledOn) {
  if (!enrolledOn) return 1;
  const start = new Date(enrolledOn);
  const now = new Date();
  const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + 1;
  return Math.max(1, months);
}

// Retourne, pour chaque élève actif, ce qui est attendu (frais mensuel de
// sa classe × mois écoulés depuis l'inscription) face à ce qui a été payé
// (paiements motif "Scolarité" uniquement).
export function computeCollectionsRows() {
  const students = (state.cache.students || []).filter((s) => s.status === "Actif");
  const classes = state.cache.classes || [];
  const payments = state.cache.payments || [];

  const feeByClass = {};
  classes.forEach((c) => (feeByClass[c.name] = Number(c.monthly_fee) || 0));

  const paidByStudent = {};
  const lastMethodByStudent = {};
  payments
    .filter((p) => p.reason === "Scolarité")
    .forEach((p) => {
      paidByStudent[p.student_name] = (paidByStudent[p.student_name] || 0) + Number(p.amount_paid || 0);
      if (!(p.student_name in lastMethodByStudent)) lastMethodByStudent[p.student_name] = p.method;
    });

  return students.map((s) => {
    const fee = feeByClass[s.class_name] || 0;
    const months = monthsElapsed(s.enrolled_on);
    const expected = fee * months;
    const paid = paidByStudent[s.name] || 0;
    const remaining = expected - paid;
    return {
      student: s,
      fee,
      months,
      expected,
      paid,
      remaining,
      lastMethod: lastMethodByStudent[s.name] || null,
      configured: fee > 0,
    };
  });
}

export function collectionsRowFor(studentName) {
  return computeCollectionsRows().find((r) => r.student.name === studentName) || null;
}
