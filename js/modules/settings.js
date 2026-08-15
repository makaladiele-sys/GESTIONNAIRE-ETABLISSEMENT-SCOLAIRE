// ==========================================================================
// Paramètres de l'établissement
// ==========================================================================
import { getSupabase } from "../supabaseClient.js";
import { state } from "../state.js";
import { toast, escapeHtml } from "../ui.js";

const el = (id) => document.getElementById(id);

export async function refresh() {
  const s = state.school;
  if (!s) return;
  el("setSchool").value = s.name || "";
  el("setYear").value = s.current_academic_year || "2026-2027";
  el("setPhone").value = s.phone || "";
  el("setEmail").value = s.email || "";
  el("setCurrency").value = s.currency || "FCFA";
  el("setTimezone").value = s.timezone || "Africa/Dakar";
  el("setAddress").value = s.address || "";
}

export function mount() {
  el("saveSettingsBtn")?.addEventListener("click", async () => {
    const sb = getSupabase();
    const payload = {
      name: el("setSchool").value.trim(),
      current_academic_year: el("setYear").value,
      phone: el("setPhone").value.trim(),
      email: el("setEmail").value.trim(),
      currency: el("setCurrency").value,
      timezone: el("setTimezone").value.trim(),
      address: el("setAddress").value.trim(),
    };
    try {
      const { data, error } = await sb.from("schools").update(payload).eq("id", state.school.id).select().single();
      if (error) throw error;
      state.school = data;
      toast("Paramètres enregistrés");
      await refresh();
    } catch (err) {
      toast("Erreur : " + err.message);
    }
  });
}
