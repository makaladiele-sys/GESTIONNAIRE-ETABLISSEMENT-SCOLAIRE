// ==========================================================================
// Super Admin plateforme : validation des établissements inscrits.
// Visible uniquement pour le rôle "platform_admin" (voir sql/schema.sql,
// section 9, pour promouvoir votre propre compte).
// ==========================================================================
import { getSupabase } from "../supabaseClient.js";
import { toast, escapeHtml } from "../ui.js";

const el = (id) => document.getElementById(id);

export async function refresh() {
  const sb = getSupabase();
  el("superAdminBody").innerHTML = `<tr><td colspan="6" class="empty">Chargement…</td></tr>`;
  const { data, error } = await sb.from("schools").select("*").order("created_at", { ascending: false });
  if (error) {
    el("superAdminBody").innerHTML = `<tr><td colspan="6" class="empty">Erreur : ${escapeHtml(error.message)}</td></tr>`;
    return;
  }
  const rows = data || [];
  const pending = rows.filter((s) => s.status === "pending").length;
  const active = rows.filter((s) => s.status === "active").length;

  el("superAdminStats").innerHTML = `
    <div class="stat"><div><div class="label">Établissements</div><div class="value">${rows.length}</div></div><div class="stat-icon">🏫</div></div>
    <div class="stat"><div><div class="label">En attente</div><div class="value">${pending}</div></div><div class="stat-icon">⏳</div></div>
    <div class="stat"><div><div class="label">Actifs</div><div class="value">${active}</div></div><div class="stat-icon">✅</div></div>`;

  el("superAdminBody").innerHTML =
    rows
      .map((s) => {
        const created = s.created_at ? new Date(s.created_at).toLocaleDateString("fr-FR") : "—";
        const statusBadge =
          s.status === "active"
            ? '<span class="badge green">Actif</span>'
            : s.status === "suspended"
            ? '<span class="badge red">Suspendu</span>'
            : '<span class="badge orange">En attente</span>';
        const action =
          s.status === "active"
            ? `<button class="btn btn-light btn-sm" data-status="suspended" data-id="${s.id}">Suspendre</button>`
            : `<button class="btn btn-primary btn-sm" data-status="active" data-id="${s.id}">Activer</button>`;
        return `<tr>
        <td><b>${escapeHtml(s.name || "—")}</b></td>
        <td>${escapeHtml(s.email || "—")}</td>
        <td>${escapeHtml(s.phone || "—")}</td>
        <td>${created}</td>
        <td>${statusBadge}</td>
        <td>${action}</td>
      </tr>`;
      })
      .join("") || `<tr><td colspan="6" class="empty">Aucun établissement inscrit pour le moment.</td></tr>`;
}

export function mount() {
  el("superAdminBody")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-status]");
    if (!btn) return;
    const sb = getSupabase();
    const { error } = await sb.from("schools").update({ status: btn.dataset.status }).eq("id", btn.dataset.id);
    if (error) return toast("Erreur : " + error.message);
    toast(btn.dataset.status === "active" ? "Établissement activé" : "Établissement suspendu");
    await refresh();
  });
  el("refreshSuperAdmin")?.addEventListener("click", refresh);
}
