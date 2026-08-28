// ==========================================================================
// Périodes scolaires par cycle.
//
// Préscolaire + Primaire : 3 trimestres.
// Moyen (collège) + Secondaire (lycée) : 2 semestres (année de 9 mois
// coupée en deux).
//
// Toute la logique "quelle période afficher pour quelle classe" passe par
// ce module — ne plus jamais coder "Trimestre 1/2/3" en dur ailleurs.
// ==========================================================================
import { state } from "./state.js";

const TRIMESTRES = ["Trimestre 1", "Trimestre 2", "Trimestre 3"];
const SEMESTRES = ["Semestre 1", "Semestre 2"];

const PERIODS_BY_CYCLE = {
  "Préscolaire": TRIMESTRES,
  "Primaire": TRIMESTRES,
  "Moyen": SEMESTRES,
  "Secondaire": SEMESTRES,
  "Lycée": SEMESTRES,
};

// Cycle par défaut si la classe n'a pas de cycle reconnu (ne devrait pas
// arriver, mais évite un select vide qui bloquerait la saisie).
const DEFAULT_PERIODS = TRIMESTRES;

export function getPeriodsForCycle(cycle) {
  return PERIODS_BY_CYCLE[cycle] || DEFAULT_PERIODS;
}

export function getCycleForClass(className) {
  const cls = (state.cache.classes || []).find((c) => c.name === className);
  return cls?.cycle || null;
}

export function getPeriodsForClass(className) {
  return getPeriodsForCycle(getCycleForClass(className));
}

// Union de toutes les périodes existantes, tous cycles confondus — utile
// pour les filtres qui s'appliquent à plusieurs classes à la fois (page
// Notes, page Bulletins), où l'on ne peut pas encore savoir quel cycle
// est concerné.
export function getAllPeriods() {
  return [...new Set(Object.values(PERIODS_BY_CYCLE).flat())];
}
