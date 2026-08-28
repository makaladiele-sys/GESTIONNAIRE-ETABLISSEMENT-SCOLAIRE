// ==========================================================================
// Présences & assiduité — appel par classe, jour par jour
//
// Rôles concernés : admin établissement, secrétaire, enseignant, platform_admin
//
// Fonctionnalités :
// - Compteurs du jour (présents / absents / retards)
// - Liste filtrable (date / classe / statut) des enregistrements
// - Modal "Faire l'appel" : sélection classe + date, cases à cocher par
//   élève (Présent / Absent / Retard), enregistrement en une fois (upsert)
// ==========================================================================

import { getSupabase } from "../supabaseClient.js";
import { toast, escapeHtml } from "../ui.js";

// ⚠️ À VÉRIFIER : adaptez cet import au nom réel exporté par state.js pour
// obtenir le school_id de l'établissement actuellement connecté (nécessaire
// pour l'INSERT/UPSERT dans attendance_records, à cause du with_check RLS
// qui exige school_id = current_school_id()). Si state.js expose autre
// chose (ex. state.schoolId, getActiveSchool().id, etc.), remplacez la
// ligne d'import et l'appel dans saveRollCall().
import { getCurrentSchoolId } from "../state.js";

const el = (id) => document.getElementById(id);

// --------------------------------------------------------------------------
// Statuts
// --------------------------------------------------------------------------

const STATUS_OPTIONS = ["Présent", "Absent", "Retard"];

// ⚠️ À VÉRIFIER : nom exact des colonnes dans la table "students".
// Hypothèse retenue (cohérente avec le tableau "Élèves" affiché et avec
// attendance_records.student_name) : students.name pour le nom complet,
// students.class_name (texte) pour la classe. Si vos colonnes s'appellent
// autrement (ex. full_name, class_id), ajustez studentDisplayName() et
// STUDENT_CLASS_COLUMN ci-dessous.
const STUDENT_CLASS_COLUMN = "class_name";

function studentDisplayName(row) {
  return (
    row.name ||
    row.full_name ||
    [row.first_name, row.last_name].filter(Boolean).join(" ") ||
    "Élève sans nom"
  );
}

// ⚠️ À VÉRIFIER : nom exact de la colonne "nom de la classe" dans la table
// "classes". Hypothèse : classes.name.
function classDisplayName(row) {
  return row.name || row.class_name || "Classe";
}

// --------------------------------------------------------------------------
// Chargement des classes (filtre page + select du modal)
// --------------------------------------------------------------------------

let _classesCache = [];

async function loadClasses() {
  const sb = getSupabase();
  if (!sb) return [];

  const { data, error } = await sb
    .from("classes")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    console.error("[Attendance] Erreur chargement classes :", error);
    return [];
  }

  _classesCache = Array.isArray(data) ? data : [];
  return _classesCache;
}

function fillClassSelects() {
  const filterSelect = el("attClassFilter");
  const rollSelect = el("fRollClass");

  const options = _classesCache
    .map(
      (c) =>
        `<option value="${escapeHtml(classDisplayName(c))}">${escapeHtml(
          classDisplayName(c)
        )}</option>`
    )
    .join("");

  if (filterSelect) {
    filterSelect.innerHTML =
      `<option value="">Toutes les classes</option>` + options;
  }

  if (rollSelect) {
    rollSelect.innerHTML = options;
  }
}

// --------------------------------------------------------------------------
// Rafraîchir la liste + compteurs du jour
// --------------------------------------------------------------------------

let _refreshPromise = null;

export async function refresh() {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = _refreshInner().finally(() => {
    _refreshPromise = null;
  });
  return _refreshPromise;
}

async function _refreshInner() {
  const body = el("attendanceBody");
  if (!body) {
    console.error("[Attendance] Élément #attendanceBody introuvable.");
    return;
  }

  body.innerHTML = `
    <tr><td colspan="4" class="empty">Chargement…</td></tr>
  `;

  try {
    const sb = getSupabase();
    if (!sb) throw new Error("Client Supabase indisponible.");

    await sb.auth.getSession();

    if (!_classesCache.length) {
      await loadClasses();
      fillClassSelects();
    }

    const dateInput = el("fAttFilterDate");
    const today = new Date().toISOString().slice(0, 10);
    if (dateInput && !dateInput.value) dateInput.value = today;
    const filterDate = dateInput?.value || today;

    const classFilter = el("attClassFilter")?.value || "";
    const statusFilter = el("attStatusFilter")?.value || "";

    console.log("[Attendance] Chargement des présences…", {
      filterDate,
      classFilter,
      statusFilter,
    });

    let query = sb
      .from("attendance_records")
      .select("*")
      .eq("date", filterDate)
      .order("student_name", { ascending: true });

    if (classFilter) query = query.eq("class_name", classFilter);
    if (statusFilter) query = query.eq("status", statusFilter);

    const { data, error } = await query;

    if (error) {
      console.error("[Attendance] Erreur Supabase :", error);
      body.innerHTML = `
        <tr><td colspan="4" class="empty"><b>Erreur de chargement</b><br>${escapeHtml(
          error.message
        )}</td></tr>
      `;
      return;
    }

    const rows = Array.isArray(data) ? data : [];

    // Compteurs du jour : toujours calculés sur TOUT le jour (indépendant
    // du filtre classe/statut affiché dans le tableau ci-dessous).
    const { data: dayData } = await sb
      .from("attendance_records")
      .select("status")
      .eq("date", filterDate);

    const dayRows = Array.isArray(dayData) ? dayData : [];
    const present = dayRows.filter((r) => r.status === "Présent").length;
    const absent = dayRows.filter((r) => r.status === "Absent").length;
    const late = dayRows.filter((r) => r.status === "Retard").length;

    if (el("attPresent")) el("attPresent").textContent = present;
    if (el("attAbsent")) el("attAbsent").textContent = absent;
    if (el("attLate")) el("attLate").textContent = late;

    if (!rows.length) {
      body.innerHTML = `
        <tr><td colspan="4" class="empty">Aucun enregistrement pour ce jour.</td></tr>
      `;
      return;
    }

    body.innerHTML = rows
      .map((r) => {
        let badge = `<span class="badge orange">${escapeHtml(r.status)}</span>`;
        if (r.status === "Présent") badge = `<span class="badge green">${escapeHtml(r.status)}</span>`;
        if (r.status === "Absent") badge = `<span class="badge red">${escapeHtml(r.status)}</span>`;

        return `
          <tr>
            <td>${escapeHtml(r.student_name)}</td>
            <td>${escapeHtml(r.class_name)}</td>
            <td>${badge}</td>
            <td>${escapeHtml(r.date)}</td>
          </tr>
        `;
      })
      .join("");
  } catch (err) {
    console.error("[Attendance] Exception :", err);
    body.innerHTML = `
      <tr><td colspan="4" class="empty"><b>Erreur inattendue</b><br>${escapeHtml(
        err?.message || "Impossible de charger les présences."
      )}</td></tr>
    `;
  }
}

// --------------------------------------------------------------------------
// Modal "Faire l'appel"
// --------------------------------------------------------------------------

function openModal() {
  const modal = el("attendanceModal");
  if (!modal) return;
  modal.style.display = "flex";

  const dateInput = el("fRollDate");
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().slice(0, 10);
  }

  if (!_classesCache.length) {
    loadClasses().then(fillClassSelects).then(loadRollCallList);
  } else {
    fillClassSelects();
    loadRollCallList();
  }
}

function closeModal() {
  const modal = el("attendanceModal");
  if (modal) modal.style.display = "none";
}

// Charge les élèves de la classe sélectionnée dans le modal, avec les
// statuts déjà enregistrés pour la date choisie (pré-cochés si existants).
async function loadRollCallList() {
  const list = el("rollCallList");
  if (!list) return;

  const className = el("fRollClass")?.value;
  const date = el("fRollDate")?.value || new Date().toISOString().slice(0, 10);

  if (!className) {
    list.innerHTML = `<div class="empty">Sélectionnez une classe.</div>`;
    return;
  }

  list.innerHTML = `<div class="empty">Chargement des élèves…</div>`;

  try {
    const sb = getSupabase();
    if (!sb) throw new Error("Client Supabase indisponible.");

    const { data: students, error: studentsError } = await sb
      .from("students")
      .select("*")
      .eq(STUDENT_CLASS_COLUMN, className)
      .order("name", { ascending: true });

    if (studentsError) throw studentsError;

    const { data: existing, error: existingError } = await sb
      .from("attendance_records")
      .select("student_name, status")
      .eq("class_name", className)
      .eq("date", date);

    if (existingError) throw existingError;

    const existingMap = new Map(
      (existing || []).map((r) => [r.student_name, r.status])
    );

    const rows = Array.isArray(students) ? students : [];

    if (!rows.length) {
      list.innerHTML = `<div class="empty">Aucun élève dans cette classe.</div>`;
      return;
    }

    list.innerHTML = `
      <table class="table">
        <thead><tr><th>Élève</th><th>Statut</th></tr></thead>
        <tbody>
          ${rows
            .map((s) => {
              const name = studentDisplayName(s);
              const current = existingMap.get(name) || "Présent";

              const optionsHtml = STATUS_OPTIONS.map(
                (status) =>
                  `<option value="${status}" ${
                    status === current ? "selected" : ""
                  }>${status}</option>`
              ).join("");

              return `
                <tr>
                  <td>${escapeHtml(name)}</td>
                  <td>
                    <select class="form-control roll-status" data-student="${escapeHtml(
                      name
                    )}">
                      ${optionsHtml}
                    </select>
                  </td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    `;
  } catch (err) {
    console.error("[Attendance] Erreur chargement élèves :", err);
    list.innerHTML = `
      <div class="empty"><b>Erreur</b><br>${escapeHtml(
        err?.message || "Impossible de charger les élèves."
      )}</div>
    `;
  }
}

// Enregistre l'appel : upsert d'une ligne par élève dans attendance_records.
async function saveRollCall() {
  const className = el("fRollClass")?.value;
  const date = el("fRollDate")?.value;

  if (!className || !date) {
    toast("Sélectionnez une classe et une date.");
    return;
  }

  const selects = document.querySelectorAll("#rollCallList .roll-status");

  if (!selects.length) {
    toast("Aucun élève à enregistrer.");
    return;
  }

  try {
    const sb = getSupabase();
    if (!sb) throw new Error("Client Supabase indisponible.");

    const schoolId = getCurrentSchoolId();
    if (!schoolId) throw new Error("Établissement introuvable.");

    const records = Array.from(selects).map((sel) => ({
      school_id: schoolId,
      student_name: sel.dataset.student,
      class_name: className,
      date,
      status: sel.value,
    }));

    console.log("[Attendance] Enregistrement de l'appel :", records);

    const { error } = await sb
      .from("attendance_records")
      .upsert(records, { onConflict: "school_id,student_name,date" });

    if (error) {
      console.error("[Attendance] Erreur UPSERT :", error);
      toast("Erreur : " + error.message);
      return;
    }

    toast("✅ Appel enregistré.");
    closeModal();
    await refresh();
  } catch (err) {
    console.error("[Attendance] Exception UPSERT :", err);
    toast("Erreur : " + (err?.message || "Impossible d'enregistrer l'appel."));
  }
}

// --------------------------------------------------------------------------
// Montage
// --------------------------------------------------------------------------

let _mounted = false;

export function mount() {
  if (_mounted) return;
  _mounted = true;

  el("openAddAttendance")?.addEventListener("click", openModal);

  el("attendanceModal")
    ?.querySelector("[data-close-modal]")
    ?.addEventListener("click", closeModal);

  el("fRollClass")?.addEventListener("change", loadRollCallList);
  el("fRollDate")?.addEventListener("change", loadRollCallList);

  el("saveRollCallBtn")?.addEventListener("click", saveRollCall);

  el("fAttFilterDate")?.addEventListener("change", refresh);
  el("attClassFilter")?.addEventListener("change", refresh);
  el("attStatusFilter")?.addEventListener("change", refresh);
}
