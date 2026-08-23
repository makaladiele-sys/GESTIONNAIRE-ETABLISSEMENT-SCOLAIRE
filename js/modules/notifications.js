// ==========================================================================
// Cloche de notifications (🔔) — affiche les messages "Notification interne"
// pertinents pour le rôle de la personne connectée :
// - Parent / Élève / Enseignant : messages ciblant leur audience + "Toute l'école"
// - Personnel (admin, secrétaire, comptable) : tous les messages internes
// - Super Admin plateforme : pas concerné (pas rattaché à un établissement précis)
//
// L'état "lu / non lu" est stocké dans Supabase (table notification_reads,
// une ligne par utilisateur), donc synchronisé entre tous les appareils du
// même compte — voir sql/notification_reads_migration.sql.
// ==========================================================================
import { getSupabase } from "../supabaseClient.js";
import { listRows, state, isPlatformAdmin } from "../state.js";
import { escapeHtml } from "../ui.js";

const el = (id) => document.getElementById(id);
const EPOCH = "1970-01-01T00:00:00.000Z";

// Mise en cache en mémoire pour la session en cours, pour éviter une requête
// Supabase à chaque rendu. Réinitialisé à la connexion/déconnexion.
let cachedLastRead = null;

export function resetReadCache() {
  cachedLastRead = null;
}

function audienceMatches(audience) {
  if (isPlatformAdmin()) return false; // pas de notifications d'établissement pour le SuperAdmin
  if (audience === "Toute l'école") return true;

  const role = state.profile?.role;
  const isStaff = ["admin", "secretary", "accountant"].includes(role);
  if (isStaff) return true; // le personnel voit tous les messages internes

  if (role === "parent") return audience === "Parents";
  if (role === "student") return audience === "Élèves";
  if (role === "teacher") return audience === "Enseignants";
  return false;
}

function relevantMessages() {
  return (state.cache.messages || [])
    .filter((m) => m.channel === "Notification interne" && audienceMatches(m.audience))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function getLastRead() {
  if (cachedLastRead) return cachedLastRead;
  const sb = getSupabase();
  const userId = state.user?.id;
  if (!sb || !userId) return EPOCH;
  try {
    const { data } = await sb.from("notification_reads").select("last_read_at").eq("user_id", userId).maybeSingle();
    cachedLastRead = data?.last_read_at || EPOCH;
  } catch (_) {
    cachedLastRead = EPOCH;
  }
  return cachedLastRead;
}

async function setLastRead(iso) {
  cachedLastRead = iso;
  const sb = getSupabase();
  const userId = state.user?.id;
  if (!sb || !userId) return;
  try {
    await sb.from("notification_reads").upsert({ user_id: userId, last_read_at: iso });
  } catch (_) {
    // best-effort : si l'écriture échoue (hors-ligne, etc.), le badge se
    // remettra à jour normalement à la prochaine ouverture réussie.
  }
}

async function render() {
  const wrap = el("notifWrap");
  if (isPlatformAdmin()) {
    if (wrap) wrap.style.display = "none";
    return;
  }
  if (wrap) wrap.style.display = "";

  const msgs = relevantMessages();
  const lastRead = await getLastRead();
  const unread = msgs.filter((m) => new Date(m.created_at) > new Date(lastRead));

  const badge = el("notifBadge");
  if (badge) {
    if (unread.length) {
      badge.textContent = unread.length > 9 ? "9+" : String(unread.length);
      badge.style.display = "flex";
    } else {
      badge.style.display = "none";
    }
  }

  const list = el("notifList");
  if (list) {
    list.innerHTML =
      msgs
        .slice(0, 20)
        .map((m) => {
          const isUnread = new Date(m.created_at) > new Date(lastRead);
          const dateStr = new Date(m.created_at).toLocaleDateString("fr-FR", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          });
          return `<div class="notif-item${isUnread ? " unread" : ""}">
            <div class="notif-item-top">
              <span class="notif-item-audience">${escapeHtml(m.audience)}</span>
              <span class="notif-item-date">${dateStr}</span>
            </div>
            <div class="notif-item-body">${escapeHtml(m.body || "")}</div>
          </div>`;
        })
        .join("") || `<div class="notif-empty">Aucune notification pour le moment.</div>`;
  }
}

export async function refreshBell() {
  if (!state.profile || isPlatformAdmin()) return;
  if (!state.cache.messages) {
    try {
      await listRows("messages", { orderBy: "created_at", ascending: false });
    } catch (_) {
      return;
    }
  }
  await render();
}

async function togglePanel(forceShow) {
  const panel = el("notifPanel");
  if (!panel) return;
  const show = forceShow !== undefined ? forceShow : panel.style.display === "none" || !panel.style.display;
  panel.style.display = show ? "block" : "none";
  if (show) {
    await setLastRead(new Date().toISOString());
    await render();
  }
}

export function mountBell() {
  el("notifBellBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    togglePanel();
  });

  document.addEventListener("click", (e) => {
    const panel = el("notifPanel");
    const btn = el("notifBellBtn");
    if (!panel || panel.style.display !== "block") return;
    if (panel.contains(e.target) || btn?.contains(e.target)) return;
    togglePanel(false);
  });
}
