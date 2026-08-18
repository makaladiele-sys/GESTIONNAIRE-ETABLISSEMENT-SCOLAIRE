// ==========================================================================
// Super Admin plateforme : gestion des établissements
//
// Rôles concernés : platform_admin
//
// Fonctionnalités :
// - Affichage de tous les établissements
// - Compteurs : total / attente / actifs / suspendus
// - Activation d'un établissement
// - Suspension d'un établissement
// - Actualisation après chaque action
// - Gestion détaillée des erreurs Supabase
// ==========================================================================

import { getSupabase } from "../supabaseClient.js";
import { toast, escapeHtml } from "../ui.js";

const el = (id) => document.getElementById(id);

// --------------------------------------------------------------------------
// Configuration
// --------------------------------------------------------------------------

const STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  SUSPENDED: "suspended",
};

// --------------------------------------------------------------------------
// Rafraîchir les établissements
// --------------------------------------------------------------------------

// Empêche plusieurs refresh() concurrents de partir en parallèle et de se
// marcher dessus (cause du 0 / 14 / 0 observé quand auth.js déclenchait
// plusieurs fois onAuthenticated()).
let _refreshPromise = null;

export async function refresh() {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = _refreshInner().finally(() => {
    _refreshPromise = null;
  });
  return _refreshPromise;
}

async function _refreshInner() {
  const body = el("superAdminBody");
  const stats = el("superAdminStats");

  if (!body) {
    console.error("[SuperAdmin] Élément #superAdminBody introuvable.");
    return;
  }

  body.innerHTML = `
    <tr>
      <td colspan="6" class="empty">
        Chargement des établissements…
      </td>
    </tr>
  `;

  try {
    const sb = getSupabase();

    if (!sb) {
      throw new Error("Client Supabase indisponible.");
    }

    // Force la résolution complète de la session AVANT d'interroger
    // "schools" (protégée par RLS pour platform_admin). Sans ça, la
    // requête peut partir avec un token pas encore attaché -> RLS
    // renvoie 0 ligne, silencieusement (pas d'erreur, tableau vide).
    await sb.auth.getSession();

    console.log("[SuperAdmin] Chargement de la table schools…");

    const { data, error } = await sb
      .from("schools")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[SuperAdmin] Erreur Supabase :", error);

      body.innerHTML = `
        <tr>
          <td colspan="6" class="empty">
            <b>Erreur de chargement</b><br>
            ${escapeHtml(error.message)}
          </td>
        </tr>
      `;

      if (stats) {
        stats.innerHTML = `
          <div class="stat">
            <div>
              <div class="label">Établissements</div>
              <div class="value">—</div>
            </div>
            <div class="stat-icon">🏫</div>
          </div>

          <div class="stat">
            <div>
              <div class="label">En attente</div>
              <div class="value">—</div>
            </div>
            <div class="stat-icon">⏳</div>
          </div>

          <div class="stat">
            <div>
              <div class="label">Actifs</div>
              <div class="value">—</div>
            </div>
            <div class="stat-icon">✅</div>
          </div>

          <div class="stat">
            <div>
              <div class="label">Suspendus</div>
              <div class="value">—</div>
            </div>
            <div class="stat-icon">⛔</div>
          </div>
        `;
      }

      return;
    }

    const rows = Array.isArray(data) ? data : [];

    console.log(`[SuperAdmin] ${rows.length} établissement(s) récupéré(s).`, rows);

    // ----------------------------------------------------------------------
    // Statistiques
    // ----------------------------------------------------------------------

    const pending = rows.filter((s) => s.status === STATUS.PENDING).length;
    const active = rows.filter((s) => s.status === STATUS.ACTIVE).length;
    const suspended = rows.filter((s) => s.status === STATUS.SUSPENDED).length;

    // ----------------------------------------------------------------------
    // Affichage des statistiques
    // ----------------------------------------------------------------------

    if (stats) {
      stats.innerHTML = `
        <div class="stat">
          <div>
            <div class="label">
              Établissements
            </div>

            <div class="value">
              ${rows.length}
            </div>
          </div>

          <div class="stat-icon">
            🏫
          </div>
        </div>

        <div class="stat">
          <div>
            <div class="label">
              En attente
            </div>

            <div class="value">
              ${pending}
            </div>
          </div>

          <div class="stat-icon">
            ⏳
          </div>
        </div>

        <div class="stat">
          <div>
            <div class="label">
              Actifs
            </div>

            <div class="value">
              ${active}
            </div>
          </div>

          <div class="stat-icon">
            ✅
          </div>
        </div>

        <div class="stat">
          <div>
            <div class="label">
              Suspendus
            </div>

            <div class="value">
              ${suspended}
            </div>
          </div>

          <div class="stat-icon">
            ⛔
          </div>
        </div>
      `;
    }

    // ----------------------------------------------------------------------
    // Aucun établissement
    // ----------------------------------------------------------------------

    if (!rows.length) {
      body.innerHTML = `
        <tr>
          <td colspan="6" class="empty">
            Aucun établissement inscrit pour le moment.
          </td>
        </tr>
      `;

      return;
    }

    // ----------------------------------------------------------------------
    // Tableau
    // ----------------------------------------------------------------------

    body.innerHTML = rows
      .map((school) => {
        const created = school.created_at
          ? new Date(school.created_at).toLocaleDateString("fr-FR")
          : "—";

        let statusBadge = "";

        if (school.status === STATUS.ACTIVE) {
          statusBadge = `
            <span class="badge green">
              Actif
            </span>
          `;
        } else if (school.status === STATUS.SUSPENDED) {
          statusBadge = `
            <span class="badge red">
              Suspendu
            </span>
          `;
        } else {
          statusBadge = `
            <span class="badge orange">
              En attente
            </span>
          `;
        }

      let action = "";

if (school.status === STATUS.ACTIVE) {
  action = `
    <button
      class="btn btn-light btn-sm"
      data-status="suspended"
      data-id="${escapeHtml(school.id)}"
    >
      ⛔ Suspendre
    </button>
  `;
} else {
  action = `
    <button
      class="btn btn-primary btn-sm"
      data-status="active"
      data-id="${escapeHtml(school.id)}"
    >
      ✅ Activer
    </button>
  `;
}

action += `
  <button
    class="btn btn-light btn-sm"
    data-delete-school="${escapeHtml(school.id)}"
    style="margin-left:6px"
  >
    🗑️ Supprimer
  </button>
`;

        return `
          <tr>

            <td>
              <b>
                ${escapeHtml(school.name || "—")}
              </b>
            </td>

            <td>
              ${escapeHtml(school.email || "—")}
            </td>

            <td>
              ${escapeHtml(school.phone || "—")}
            </td>

            <td>
              ${created}
            </td>

            <td>
              ${statusBadge}
            </td>

            <td>
              ${action}
            </td>

          </tr>
        `;
      })
      .join("");

  } catch (err) {
    console.error("[SuperAdmin] Exception :", err);

    body.innerHTML = `
      <tr>
        <td colspan="6" class="empty">
          <b>Erreur inattendue</b><br>
          ${escapeHtml(err?.message || "Impossible de charger les établissements.")}
        </td>
      </tr>
    `;
  }
}
// --------------------------------------------------------------------------
// Supprimer définitivement un établissement
// --------------------------------------------------------------------------

async function deleteSchool(schoolId) {
  if (!schoolId) {
    toast("Établissement invalide.");
    return;
  }

  const confirmation = window.confirm(
    "⚠️ ATTENTION\n\n" +
    "Voulez-vous vraiment supprimer définitivement cet établissement ?\n\n" +
    "Cette opération est irréversible."
  );

  if (!confirmation) {
    return;
  }

  try {
    const sb = getSupabase();

    if (!sb) {
      throw new Error("Client Supabase indisponible.");
    }

    console.log("[SuperAdmin] Suppression de l'établissement :", schoolId);

    const { error } = await sb
      .from("schools")
      .delete()
      .eq("id", schoolId);

    if (error) {
      console.error("[SuperAdmin] Erreur DELETE :", error);
      toast("Erreur : " + error.message);
      return;
    }

    toast("🗑️ Établissement supprimé.");

    await refresh();

  } catch (err) {
    console.error("[SuperAdmin] Exception DELETE :", err);

    toast(
      "Erreur : " +
      (err?.message || "Impossible de supprimer l'établissement.")
    );
  }
}
// --------------------------------------------------------------------------
// Changer le statut d'un établissement
// --------------------------------------------------------------------------

async function updateSchoolStatus(schoolId, newStatus) {
  if (!schoolId || !newStatus) {
    toast("Informations d'établissement invalides.");
    return;
  }

  if (![STATUS.ACTIVE, STATUS.SUSPENDED].includes(newStatus)) {
    toast("Statut non autorisé.");
    return;
  }

  const actionLabel = newStatus === STATUS.ACTIVE ? "activer" : "suspendre";

  const confirmation = window.confirm(`Voulez-vous vraiment ${actionLabel} cet établissement ?`);

  if (!confirmation) {
    return;
  }

  try {
    const sb = getSupabase();

    console.log("[SuperAdmin] Modification statut :", { schoolId, newStatus });

    const { data, error } = await sb
      .from("schools")
      .update({ status: newStatus })
      .eq("id", schoolId)
      .select()
      .single();

    if (error) {
      console.error("[SuperAdmin] Erreur UPDATE :", error);
      toast("Erreur : " + error.message);
      return;
    }

    console.log("[SuperAdmin] Établissement modifié :", data);

    if (newStatus === STATUS.ACTIVE) {
      toast("✅ Établissement activé.");
    } else {
      toast("⛔ Établissement suspendu.");
    }

    await refresh();

  } catch (err) {
    console.error("[SuperAdmin] Exception UPDATE :", err);

    toast("Erreur : " + (err?.message || "Impossible de modifier l'établissement."));
  }
}

// --------------------------------------------------------------------------
// Montage
// --------------------------------------------------------------------------

// Empêche mount() d'attacher deux fois les mêmes écouteurs si la vue Super
// Admin est montée plusieurs fois.
let _mounted = false;

export function mount() {
  if (_mounted) return;
  _mounted = true;

  const body = el("superAdminBody");

  body?.addEventListener("click", async (event) => {

  // ------------------------------------------------------------
  // Activer / suspendre
  // ------------------------------------------------------------

  const statusButton = event.target.closest("[data-status]");

  if (statusButton) {
    const schoolId = statusButton.dataset.id;
    const newStatus = statusButton.dataset.status;

    await updateSchoolStatus(schoolId, newStatus);
    return;
  }

  // ------------------------------------------------------------
  // Supprimer
  // ------------------------------------------------------------

  const deleteButton = event.target.closest("[data-delete-school]");

  if (deleteButton) {
    const schoolId = deleteButton.dataset.deleteSchool;

    await deleteSchool(schoolId);
    return;
  }
});
  el("refreshSuperAdmin")?.addEventListener("click", refresh);
}
