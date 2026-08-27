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

// --------------------------------------------------------------------------
// Traduction des messages d'erreur Supabase (renvoyés en anglais) vers le
// français, pour l'affichage dans la zone authError.
// --------------------------------------------------------------------------
const AUTH_ERROR_TRANSLATIONS = [
  { match: /invalid login credentials/i, fr: "E-mail ou mot de passe incorrect." },
  { match: /email not confirmed/i, fr: "Votre adresse e-mail n'a pas encore été confirmée." },
  { match: /user already registered/i, fr: "Un compte existe déjà avec cette adresse e-mail." },
  { match: /already registered/i, fr: "Un compte existe déjà avec cette adresse e-mail." },
  { match: /password should be at least (\d+) characters/i, fr: (m) => `Le mot de passe doit contenir au moins ${m[1]} caractères.` },
  { match: /unable to validate email address/i, fr: "Adresse e-mail invalide." },
  { match: /email address .* is invalid/i, fr: "Adresse e-mail invalide." },
  { match: /rate limit/i, fr: "Trop de tentatives. Veuillez patienter avant de réessayer." },
  { match: /user not found/i, fr: "Aucun compte trouvé avec cette adresse e-mail." },
  { match: /token has expired or is invalid/i, fr: "Le lien a expiré ou a déjà été utilisé." },
  { match: /new password should be different/i, fr: "Le nouveau mot de passe doit être différent de l'ancien." },
  { match: /signup requires a valid password/i, fr: "Veuillez saisir un mot de passe valide." },
  { match: /failed to fetch|networkerror/i, fr: "Connexion internet indisponible. Vérifiez votre connexion et réessayez." },
  { match: /duplicate key value/i, fr: "Cette information est déjà utilisée par un autre compte." },
  { match: /permission denied|row-level security|401/i, fr: "Action non autorisée. Veuillez réessayer ou contacter l'administrateur." },
];

function translateAuthError(err) {
  const raw = err?.message || "";
  for (const rule of AUTH_ERROR_TRANSLATIONS) {
    const m = raw.match(rule.match);
    if (m) return typeof rule.fr === "function" ? rule.fr(m) : rule.fr;
  }
  return raw || "Une erreur est survenue. Veuillez réessayer.";
}

function showError(message, ok = false) {
  const box = el("authError");
  if (!box) return;
  box.textContent = message;
  box.classList.toggle("ok", ok);
  box.style.display = "block";
  // S'assurer que la notification est visible, même si elle est cachée par
  // la barre de navigation/tâches du navigateur (mobile notamment)
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
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

// --------------------------------------------------------------------------
// Retry réseau : distingue une coupure de connexion (retryable) d'une
// erreur métier Supabase (mot de passe incorrect, etc. -> pas de retry).
// --------------------------------------------------------------------------
function isNetworkError(err) {
  return (
    !navigator.onLine ||
    err?.message?.includes("Failed to fetch") ||
    err?.message?.includes("NetworkError") ||
    err?.name === "TypeError"
  );
}

async function withNetworkRetry(fn, { maxRetries = 3, baseDelayMs = 800, onRetry = null } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (!navigator.onLine) throw new Error("OFFLINE");
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isNetworkError(err)) throw err; // erreur métier -> on arrête tout de suite
      if (attempt === maxRetries) break;
      const delay = baseDelayMs * Math.pow(2, attempt);
      if (onRetry) onRetry(attempt + 1, maxRetries, delay);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  const friendlyError = new Error("Connexion internet indisponible. Vérifiez votre connexion et réessayez.");
  friendlyError.isNetworkError = true;
  friendlyError.originalError = lastError;
  throw friendlyError;
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

async function loadContextAndEnter(session) {
  if (!session?.user) return;
  try {
    setBusy(true);
    clearError();
    state.session = session;
    state.user = session.user;
    await loadProfileAndSchool(session.user.id);

    // Vérifier le statut de l'établissement
    if (state.school?.status === "suspended") {
      const sb = getSupabase();
      await sb.auth.signOut();
      lockGate();
      showSignupView(false);
      showError(
        "Votre établissement est actuellement suspendu. Veuillez contacter l'administrateur de la plateforme."
      );
      return;
    }

    if (state.school?.status === "pending") {
      const sb = getSupabase();
      await sb.auth.signOut();
      lockGate();
      showSignupView(false);
      showError(
        "Votre inscription est bien enregistrée et en attente de validation par l'administrateur de la plateforme. Vous recevrez un accès dès l'approbation."
      );
      return;
    }

    unlockGate();
    onAuthenticated();
  } catch (e) {
    const sb = getSupabase();
    try {
      await sb.auth.signOut();
    } catch (_) {}
    lockGate();
    showSignupView(false);
    showError(translateAuthError(e) || "Impossible de charger votre profil.");
  } finally {
    setBusy(false);
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
      showError(translateAuthError(e) || "Impossible d'envoyer le lien de réinitialisation.");
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
      const data = await withNetworkRetry(
        async () => {
          const { data, error } = await sb.auth.signInWithPassword({ email, password });
          if (error) throw error;
          return data;
        },
        {
          maxRetries: 3,
          baseDelayMs: 800,
          onRetry: (attempt, max, delay) => {
            showError(`Connexion instable, nouvelle tentative ${attempt}/${max}...`, true);
          },
        }
      );
      await loadContextAndEnter(data.session);
    } catch (e) {
      showError(translateAuthError(e) || "Échec de connexion.");
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

      // 3) Notifier le SuperAdmin par e-mail qu'un nouvel établissement
      //    attend une validation. Non bloquant : si l'envoi échoue,
      //    l'inscription reste valide (l'établissement est bien créé en
      //    "pending" et visible dans le panneau SuperAdmin).
      try {
        await sb.functions.invoke("send-email", {
          body: {
            to: "makaladiele@gmail.com",
            subject: "Nouvelle inscription en attente de validation",
            body:
              `Un nouvel établissement vient de s'inscrire et attend votre validation.\n\n` +
              `Établissement : ${schoolName}\n` +
              `E-mail : ${email}\n` +
              `Téléphone : ${phone || "non renseigné"}\n\n` +
              `Connectez-vous au panneau SuperAdmin pour valider ou refuser cette inscription.`,
            schoolName: "Gestion Scolaire Suite",
          },
        });
      } catch (notifyErr) {
        console.error("[Auth] Échec de l'envoi de la notification SuperAdmin :", notifyErr);
      }

      el("authSignupSuccess") &&
        ((el("authSignupSuccess").style.display = "block"),
        (el("authSignupSuccess").innerHTML =
          "✓ Votre inscription a bien été enregistrée. Un administrateur de la plateforme doit valider votre établissement avant que vous puissiez y accéder — vous serez notifié dès que ce sera fait."));
      ["authSignupSchoolName", "authSignupEmail", "authSignupPhone", "authSignupPassword"].forEach((id) => {
        if (el(id)) el(id).value = "";
      });
    } catch (e) {
      showError(translateAuthError(e) || "Impossible de créer votre établissement.");
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
      showError(translateAuthError(e) || "Impossible de modifier le mot de passe.");
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
      if (state.user?.id !== session.user.id) await loadContextAndEnter(session);
    }
  });

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
