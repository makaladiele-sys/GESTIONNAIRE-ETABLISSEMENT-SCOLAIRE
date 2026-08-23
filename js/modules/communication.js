// ==========================================================================
// Communication : notifications internes envoyées aux parents/enseignants.
// Canal "Email" : envoi réel via la Supabase Edge Function "send-email"
// (Gmail SMTP côté serveur — voir sql/notification_reads_migration.sql et
// send-email-function.ts). Les canaux SMS / WhatsApp restent à configurer.
// ==========================================================================
import { listRows, insertRow, state, isPlatformAdmin } from "../state.js";
import { getSupabase } from "../supabaseClient.js";
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
      <td><span class="badge ${m.status === "Échec" ? "red" : "green"}">${escapeHtml(m.status)}</span></td>
    </tr>`
      )
      .join("") || `<tr><td colspan="5" class="empty">Aucun message envoyé pour le moment.</td></tr>`;
  await refreshBell();
}

// --------------------------------------------------------------------------
// Résolution des destinataires email selon l'audience choisie.
// --------------------------------------------------------------------------

async function collectParentEmails() {
  if (!state.cache.parents) await listRows("parents");
  return (state.cache.parents || [])
    .map((p) => (p.email || "").trim())
    .filter(Boolean);
}

async function collectTeacherEmails() {
  try {
    const teachers = await listRows("profiles", { filters: { role: "teacher" } });
    return (teachers || []).map((t) => (t.email || "").trim()).filter(Boolean);
  } catch (_) {
    return [];
  }
}

async function resolveEmailRecipients(audience) {
  if (audience === "Parents") return collectParentEmails();
  if (audience === "Élèves") return collectParentEmails(); // pas d'email propre à l'élève — le parent reçoit à sa place
  if (audience === "Enseignants") return collectTeacherEmails();
  // "Toute l'école"
  const [parents, teachers] = await Promise.all([collectParentEmails(), collectTeacherEmails()]);
  return [...new Set([...parents, ...teachers])];
}

async function sendRealEmail(audience, body) {
  const recipients = await resolveEmailRecipients(audience);
  if (!recipients.length) {
    return { ok: false, error: "Aucune adresse email trouvée pour cette audience." };
  }

  const sb = getSupabase();
  const { data, error } = await sb.functions.invoke("send-email", {
    body: {
      to: recipients,
      subject: `${state.school?.name || "École"} — Notification`,
      body,
      schoolName: state.school?.name || "",
    },
  });

  if (error) return { ok: false, error: error.message || "Échec de l'envoi." };
  if (data?.error) return { ok: false, error: data.error };
  return { ok: true, sent: data?.sent || 0, failed: data?.failed || 0, total: data?.total || recipients.length };
}

export function mount() {
  el("openAddMessage")?.addEventListener("click", () => {
    el("messageForm")?.reset();
    openModal("messageModal");
  });

  el("messageForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (isPlatformAdmin()) {
      toast("Connectez-vous avec un compte établissement pour envoyer un message.");
      return;
    }

    const channel = el("fMsgChannel").value;
    const audience = el("fMsgAudience").value;
    const body = el("fMsgBody").value.trim();

    let status = "Envoyé";

    try {
      if (channel === "Email") {
        toast("Envoi des emails en cours…");
        const result = await sendRealEmail(audience, body);
        if (!result.ok) {
          status = "Échec";
          toast("Erreur d'envoi : " + result.error);
        } else if (result.failed > 0) {
          status = `Envoyé (${result.sent}/${result.total})`;
          toast(`${result.sent} email(s) envoyé(s), ${result.failed} échec(s).`);
        } else {
          toast(`${result.sent} email(s) envoyé(s).`);
        }
      }

      await insertRow("messages", { channel, audience, body, status });
      if (channel !== "Email") toast("Message enregistré");
      closeModal("messageModal");
      await refresh();
    } catch (err) {
      toast("Erreur : " + err.message);
    }
  });
}
