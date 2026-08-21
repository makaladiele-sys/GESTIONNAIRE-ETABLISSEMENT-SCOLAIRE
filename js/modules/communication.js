// ==========================================================================
// Communication : notifications internes envoyées aux parents/enseignants.
// Les canaux SMS / WhatsApp / e-mail réels nécessitent un provider tiers
// branché via une Supabase Edge Function (voir README).
// ==========================================================================
import { listRows, insertRow } from "../state.js";
import { toast, openModal, closeModal, escapeHtml } from "../ui.js";
import { refreshBell } from "./notifications.js";
const el = (id) => document.getElementById(id);
export async function refresh() {
  const rows = await listRows("messages", { orderBy: "created_at", ascending: false });
  el("messagesBody").innerHTML =
    rows
      .map(
        (m) => `<tr>
      <td>${new Date(m.created_at).toLocaleDateString("fr-FR")}</td>
      <td><span class="badge blue">${escapeHtml(m.channel)}</span></td>
      <td>${escapeHtml(m.audience)}</td>
      <td>${escapeHtml((m.body || "").slice(0, 60))}${(m.body || "").length > 60 ? "…" : ""}</td>
      <td><span class="badge green">${escapeHtml(m.status)}</span></td>
    </tr>`
      )
      .join("") || `<tr><td colspan="5" class="empty">Aucun message envoyé pour le moment.</td></tr>`;
  await refreshBell();
}
export function mount() {
  el("openAddMessage")?.addEventListener("click", () => {
    el("messageForm")?.reset();
    openModal("messageModal");
  });
  el("messageForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await insertRow("messages", {
        channel: el("fMsgChannel").value,
        audience: el("fMsgAudience").value,
        body: el("fMsgBody").value.trim(),
        status: "Envoyé",
      });
      toast("Message envoyé");
      closeModal("messageModal");
      await refresh();
    } catch (err) {
      toast("Erreur : " + err.message);
    }
  });
}
