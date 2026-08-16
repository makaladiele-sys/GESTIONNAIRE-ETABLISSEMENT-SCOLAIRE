// ==========================================================================
// Authentification Supabase : connexion, inscription d'un nouvel
// établissement, mot de passe oublié, et gate d'accès à l'application.
// ==========================================================================
import { getSupabase } from "./supabaseClient.js";
import { state, loadProfileAndSchool } from "./state.js";
import { toast } from "./ui.js";

const el = (id) => document.getElementById(id);

let onAuthenticated = () => {};
let onSignedOut = () => {};
export function setAuthCallbacks({ authenticated, signedOut }) {
  onAuthenticated = authenticated || onAuthenticated;
  onSignedOut = signedOut || onSignedOut;
}

function showError(message, ok = false) {
  const box = el("authError");
  if (!box) return;
  box.textContent = message;
  box.classList.toggle("ok", ok);
  box.style.display = "block";
}
function clearError() {
  const box = el("authError");
  if (box) box.style.display = "none";
}
function setBusy(busy) {
  const loading = el("authLoading");
  if (loading) loading.style.display = busy ? "block" : "none";
  ["authLoginBtn", "authSignupBtn", "authUpdatePasswordBtn"].forEach((id) => {
    const b = el(id);
    if (b) b.disabled = busy;
  });
}

export function lockGate() {
  document.body.classList.add("auth-locked");
  const gate = el("authGate");
  if (gate) gate.style.display = "flex";
}
export function unlockGate() {
  document.body.classList.remove("auth-locked");
  const gate = el("authGate");
  if (gate) gate.style.display = "none";
}

function showSignupView(show) {
  clearError();
  el("authSignupSuccess") && (el("authSignupSuccess").style.display = "none");
  el("authLoginFields") && (el("authLoginFields").style.display = show ? "none" : "block");
  el("authSignupFields") && (el("authSignupFields").style.display = show ? "block" : "none");
  el("authForgotBtn") && (el("authForgotBtn").style.display = show ? "none" : "block");
  el("authToggleToSignup") && (el("authToggleToSignup").style.display = show ? "none" : "block");
  el("authToggleToLogin") && (el("authToggleToLogin").style.display = show ? "block" : "none");
  el("authTitle") && (el("authTitle").textContent = show ? "Inscrire mon établissement" : "Gestion Scolaire Suite");
  el("authSubtitle") &&
    (el("authSubtitle").textContent = show
      ? "Créez le compte administrateur de votre établissement"
      : "Connexion sécurisée à votre établissement");
}

// --------------------------------------------------------------------------
// Point d'entrée unique et protégé vers loadProfileAndSchool + onAuthenticated.
// --------------------------------------------------------------------------

// Utilisateur actuellement en cours de chargement (évite les doubles appels
// concurrents déclenchés par onAuthStateChange + getSession() en parallèle).
let _enteringUserId = null;

async function loadContextAndEnter(session) {
  if (!session?.user) return;

  // Déjà en cours de chargement pour cet utilisateur -> on ignore.
  if (_enteringUserId === session.user.id) return;

  // Déjà chargé avec succès pour cet utilisateur -> on ignore (évite un
  // second passage complet quand TOKEN_REFRESHED se déclenche par ex.).
  if (state.user?.id === session.user.id && state.profile) return;

  _enteringUserId = session.user.id;

  try {
    setBusy(true);
    clearError();
    state.session = session;
    state.user = session.user;
    await loadProfileAndSchool(session.user.id);
    unlockGate();
    onAuthenticated();
  } catch (e) {
    const sb = getSupabase();
    try {
      await sb.auth.signOut();
    } catch (_) {}
    state.user = null;
    lockGate();
    showSignupView(false);
    showError(e.message || "Impossible de charger votre profil.");
  } finally {
    setBusy(false);
    // On libère le verrou seulement en cas d'échec (state.user remis à null
    // ci-dessus) ; en cas de succès, la garde "déjà chargé" plus haut prend
    // le relais pour empêcher tout rechargement inutile.
    if (!state.user) _enteringUserId = null;
  }
}

function handleRecoveryHash() {
  const hash = new URLSearchParams((location.hash || "").replace(/^#/, ""));
  const errorCode = hash.get("error_code");
  if (errorCode === "otp_expired" || errorCode === "access_denied") {
    history.replaceState({}, document.title, location.pathname + location.search);
    showError(
      errorCode === "otp_expired"
        ? "Le lien a expiré ou a déjà été utilisé. Connectez-vous avec votre mot de passe ou demandez un nouveau lien."
        : decodeURIComponent((hash.get("error_description") || "Accès refusé").replace(/\+/g, " "))
    );
  }
  if (hash.get("type") === "recovery") {
    el("authRecovery") && (el("authRecovery").style.display = "block");
    el("authForgotBtn") && (el("authForgotBtn").style.display = "none");
    el("authLoginBtn") && (el("authLoginBtn").style.display = "none");
  }
}

export function initAuth() {
  const sb = getSupabase();
  handleRecoveryHash();

  el("authToggleToSignup")?.addEventListener("click", () => showSignupView(true));
  el("authToggleToLogin")?.addEventListener("click", () => showSignupView(false));

  el("authForgotBtn")?.addEventListener("click", async () => {
    clearError();
    const email = (el("authEmail")?.value || "").trim();
    if (!email) return showError("Saisissez d'abord votre adresse e-mail.");
    try {
      setBusy(true);
      const redirectTo = window.location.origin + window.location.pathname;
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      showError("Un lien de réinitialisation vient d'être envoyé à cette adresse.", true);
    } catch (e) {
      showError(e.message || "Impossible d'envoyer le lien de réinitialisation.");
    } finally {
      setBusy(false);
    }
  });

  el("authLoginBtn")?.addEventListener("click", async () => {
    clearError();
    const email = (el("authEmail")?.value || "").trim();
    const password = el("authPassword")?.value || "";
    if (!email || !password) return showError("Saisissez votre e-mail et votre mot de passe.");
    try {
      setBusy(true);
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await loadContextAndEnter(data.session);
    } catch (e) {
      showError(e.message || "Échec de connexion.");
      setBusy(false);
    }
  });

  [el("authEmail"), el("authPassword")].forEach((input) =>
    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") el("authLoginBtn")?.click();
    })
  );

  el("authSignupBtn")?.addEventListener("click", async () => {
    clearError();
    const schoolName = (el("authSignupSchoolName")?.value || "").trim();
    const email = (el("authSignupEmail")?.value || "").trim();
    const phone = (el("authSignupPhone")?.value || "").trim();
    const password = el("authSignupPassword")?.value || "";
    if (!schoolName || !email || !password) return showError("Nom de l'établissement, e-mail et mot de passe sont requis.");
    if (password.length < 8) return showError("Le mot de passe doit contenir au moins 8 caractères.");
    try {
      setBusy(true);
      // 1) Créer l'établissement, statut "pending" (en attente de validation superadmin).
      const newSchoolId = crypto.randomUUID();
      const { error: schoolErr } = await sb.from("schools").insert({
        id: newSchoolId,
        name: schoolName,
        email,
        phone,
        status: "pending",
      });
      if (schoolErr) throw schoolErr;

      // 2) Créer le compte administrateur ; le trigger SQL handle_new_school_admin()
      //    lit school_id dans les métadonnées et crée automatiquement le profil.
      const { error: signUpErr } = await sb.auth.signUp({
        email,
        password,
        options: { data: { full_name: schoolName + " — Administrateur", school_id: newSchoolId } },
      });
      if (signUpErr) throw signUpErr;

      el("authSignupSuccess") &&
        ((el("authSignupSuccess").style.display = "block"),
        (el("authSignupSuccess").innerHTML =
          "✓ Votre demande a été envoyée. Un administrateur de la plateforme va valider votre établissement avant l'activation de votre accès."));
      ["authSignupSchoolName", "authSignupEmail", "authSignupPhone", "authSignupPassword"].forEach((id) => {
        if (el(id)) el(id).value = "";
      });
    } catch (e) {
      showError(e.message || "Impossible de créer votre établissement.");
    } finally {
      setBusy(false);
    }
  });

  el("authUpdatePasswordBtn")?.addEventListener("click", async () => {
    clearError();
    const pwd = el("authNewPassword")?.value || "";
    if (pwd.length < 8) return showError("Le nouveau mot de passe doit contenir au moins 8 caractères.");
    try {
      setBusy(true);
      const { error } = await sb.auth.updateUser({ password: pwd });
      if (error) throw error;
      el("authRecovery") && (el("authRecovery").style.display = "none");
      el("authLoginBtn") && (el("authLoginBtn").style.display = "block");
      el("authForgotBtn") && (el("authForgotBtn").style.display = "block");
      showError("Mot de passe mis à jour. Vous pouvez maintenant vous connecter.", true);
      history.replaceState({}, document.title, location.pathname + location.search);
      await sb.auth.signOut();
    } catch (e) {
      showError(e.message || "Impossible de modifier le mot de passe.");
    } finally {
      setBusy(false);
    }
  });

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_OUT") {
      state.session = null;
      state.user = null;
      state.profile = null;
      state.school = null;
      _enteringUserId = null;
      lockGate();
      onSignedOut();
      return;
    }
    if (event === "PASSWORD_RECOVERY") {
      el("authRecovery") && (el("authRecovery").style.display = "block");
      el("authForgotBtn") && (el("authForgotBtn").style.display = "none");
      el("authLoginBtn") && (el("authLoginBtn").style.display = "none");
      return;
    }
    if (session?.user && ["SIGNED_IN", "INITIAL_SESSION", "TOKEN_REFRESHED"].includes(event)) {
      await loadContextAndEnter(session);
    }
  });

  // Filet de sécurité pour les environnements où onAuthStateChange ne
  // livre pas INITIAL_SESSION assez tôt. loadContextAndEnter() étant
  // désormais idempotente (verrou _enteringUserId), cet appel ne peut
  // plus provoquer de double chargement avec celui déclenché par
  // onAuthStateChange ci-dessus.
  sb.auth.getSession().then(({ data: { session } }) => {
    if (session?.user) loadContextAndEnter(session);
    else lockGate();
  });
}

export async function logout() {
  const sb = getSupabase();
  await sb.auth.signOut();
  toast("Déconnecté");
}
