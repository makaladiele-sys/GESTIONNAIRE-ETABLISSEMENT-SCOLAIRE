// ==========================================================================
// Cloche de notifications (🔔) — affiche les messages "Notification interne"
// pertinents pour le rôle de la personne connectée :
// - Parent / Élève / Enseignant : messages ciblant leur audience + "Toute l'école"
// - Personnel (admin, secrétaire, comptable) : tous les messages internes
// - Super Admin plateforme : pas concerné (pas rattaché à un établissement précis)
//
// L'état "lu / non lu" est gardé en local (par navigateur), pas en base —
// c'est volontairement simple : pas de nouvelle table Supabase à gérer, au
// prix de ne pas se synchroniser entre plusieurs appareils du même compte.
// ==========================================================================
import { listRows, state, isPlatformAdmin } from "../state.js";
import { escapeHtml } from "../ui.js";

const el = (id) => document.getElementById(id);
const STORAGE_PREFIX = "gss_notif_last_read_";

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

function lastReadKey() {
  return STORAGE_PREFIX + (state.profile?.id || "anon");
}

function getLastRead() {
  try {
    return localStorage.getItem(lastReadKey()) || "1970-01-01T00:00:00.000Z";
  } catch (_) {
    return "1970-01-01T00:00:00.000Z";
  }
}

function setLastRead(iso) {
  try {
    localStorage.setItem(lastReadKey(), iso);
  } catch (_) {
    // localStorage indisponible (navigation privée stricte, etc.) — pas bloquant.
  }
}

function render() {
  const wrap = el("notifWrap");
  if (isPlatformAdmin()) {
    if (wrap) wrap.style.display = "none";
    return;
  }
  if (wrap) wrap.style.display = "";

  const msgs = relevantMessages();
  const lastRead = getLastRead();
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
  render();
}

function togglePanel(forceShow) {
  const panel = el("notifPanel");
  if (!panel) return;
  const show = forceShow !== undefined ? forceShow : panel.style.display === "none" || !panel.style.display;
  panel.style.display = show ? "block" : "none";
  if (show) {
    setLastRead(new Date().toISOString());
    render();
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

