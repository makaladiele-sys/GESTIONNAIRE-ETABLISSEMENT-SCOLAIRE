// ==========================================================================
// Journal d'audit — consultation des actions du compte SuperAdmin sur les
// données des établissements. Lecture seule ; réservé au platform_admin
// (RLS : voir sql/platform_admin_audit_log.sql).
// ==========================================================================
import { getSupabase } from "../supabaseClient.js";
import { toast, openModal, escapeHtml } from "../ui.js";

const el = (id) => document.getElementById(id);

const ACTION_LABELS = {
  INSERT: '<span class="badge green">Création</span>',
  UPDATE: '<span class="badge orange">Modification</span>',
  DELETE: '<span class="badge red">Suppression</span>',
};

let rows = [];

function populateTableFilter() {
  const sel = el("auditTableFilter");
  if (!sel) return;
  const tables = [...new Set(rows.map((r) => r.table_name))].sort();
  const current = sel.value;
  sel.innerHTML = `<option value="">Toutes les tables</option>` + tables.map((t) => `<option>${escapeHtml(t)}</option>`).join("");
  if (tables.includes(current)) sel.value = current;
}

function render() {
  const tableFilter = el("auditTableFilter")?.value || "";
  const actionFilter = el("auditActionFilter")?.value || "";

  const filtered = rows.filter((r) => {
    if (tableFilter && r.table_name !== tableFilter) return false;
    if (actionFilter && r.action !== actionFilter) return false;
    return true;
  });

  el("auditLogBody").innerHTML =
    filtered
      .map((r) => {
        const dateStr = new Date(r.created_at).toLocaleString("fr-FR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
        return `<tr>
        <td>${dateStr}</td>
        <td><span class="id-badge">${escapeHtml(r.table_name)}</span></td>
        <td>${ACTION_LABELS[r.action] || escapeHtml(r.action)}</td>
        <td>${escapeHtml(r.actor_email || r.actor_id)}</td>
        <td>${escapeHtml((r.record_id || "").toString().slice(0, 8))}</td>
        <td><button class="btn btn-light btn-sm" data-detail="${r.id}">🔍 Voir</button></td>
      </tr>`;
      })
      .join("") || `<tr><td colspan="6" class="empty">Aucune action journalisée pour ce filtre.</td></tr>`;
}

function showDetail(id) {
  const row = rows.find((r) => String(r.id) === String(id));
  if (!row) return;
  const box = el("auditDetailContent");
  if (!box) return;

  box.innerHTML = `
    <div class="form-group"><label>Table</label><div>${escapeHtml(row.table_name)}</div></div>
    <div class="form-group"><label>Action</label><div>${ACTION_LABELS[row.action] || escapeHtml(row.action)}</div></div>
    <div class="form-group"><label>Acteur</label><div>${escapeHtml(row.actor_email || row.actor_id)}</div></div>
    <div class="form-group"><label>Date</label><div>${new Date(row.created_at).toLocaleString("fr-FR")}</div></div>
    ${
      row.old_data
        ? `<div class="form-group full"><label>Avant</label><pre style="white-space:pre-wrap;background:#f5f6f9;padding:10px;border-radius:8px;font-size:12px">${escapeHtml(JSON.stringify(row.old_data, null, 2))}</pre></div>`
        : ""
    }
    ${
      row.new_data
        ? `<div class="form-group full"><label>Après</label><pre style="white-space:pre-wrap;background:#f5f6f9;padding:10px;border-radius:8px;font-size:12px">${escapeHtml(JSON.stringify(row.new_data, null, 2))}</pre></div>`
        : ""
    }
  `;
  openModal("auditDetailModal");
}

export async function refresh() {
  const body = el("auditLogBody");
  if (body) body.innerHTML = `<tr><td colspan="6" class="empty">Chargement…</td></tr>`;

  const sb = getSupabase();
  const { data, error } = await sb
    .from("platform_admin_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    toast("Erreur de chargement du journal : " + error.message);
    if (body) body.innerHTML = `<tr><td colspan="6" class="empty">Erreur de chargement.</td></tr>`;
    return;
  }

  rows = data || [];
  populateTableFilter();
  render();
}

export function mount() {
  el("refreshAuditLog")?.addEventListener("click", refresh);
  el("auditTableFilter")?.addEventListener("change", render);
  el("auditActionFilter")?.addEventListener("change", render);

  el("auditLogBody")?.addEventListener("click", (e) => {
    const id = e.target.closest("[data-detail]")?.dataset.detail;
    if (id) showDetail(id);
  });
}

