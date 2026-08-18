// ==========================================================================
// Initialise le client Supabase à partir de js/config.js (voir config.example.js)
// ==========================================================================
export function getSupabaseConfig() {
  const cfg = window.GSS_CONFIG || {};
  return {
    url: (cfg.SUPABASE_URL || "").trim(),
    key: (cfg.SUPABASE_ANON_KEY || "").trim(),
  };
}

export function isConfigured() {
  const { url, key } = getSupabaseConfig();
  return Boolean(url && key && !url.includes("VOTRE-PROJET"));
}

let client = null;

export function getSupabase() {
  if (client) return client;
  const { url, key } = getSupabaseConfig();
  if (!url || !key) return null;
  client = window.supabase.createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}
