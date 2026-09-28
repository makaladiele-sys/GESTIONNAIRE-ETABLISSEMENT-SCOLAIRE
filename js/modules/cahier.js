import { getSupabase } from "../supabaseClient.js";
import { state } from "../state.js";
import { toast } from "../ui.js";

const el = (id) => document.getElementById(id);

let mounted = false;
let currentDocument = null;
let currentSignature = null;

let canvas = null;
let ctx = null;
let drawing = false;
let hasSignature = false;


// ============================================================================
// UTILITAIRES
// ============================================================================

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function formatDate(value) {
  if (!value) return "—";

  return new Date(value).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}


function getSchoolId() {
  return (
    state?.profile?.school_id ||
    state?.user?.school_id ||
    null
  );
}


// ============================================================================
// SIGNATURE CANVAS
// ============================================================================

function setupCanvas() {

  canvas = el("cahierSignatureCanvas");

  if (!canvas) return;

  ctx = canvas.getContext("2d");

  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#111827";


  function position(event) {

    const rect = canvas.getBoundingClientRect();

    const source =
      event.touches?.[0] ||
      event.changedTouches?.[0] ||
      event;

    return {
      x:
        (source.clientX - rect.left) *
        (canvas.width / rect.width),

      y:
        (source.clientY - rect.top) *
        (canvas.height / rect.height)
    };
  }


  function start(event) {

    event.preventDefault();

    drawing = true;
    hasSignature = true;

    const p = position(event);

    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }


  function move(event) {

    if (!drawing) return;

    event.preventDefault();

    const p = position(event);

    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }


  function stop(event) {

    if (!drawing) return;

    event?.preventDefault();

    drawing = false;
    ctx.closePath();
  }


  canvas.addEventListener("pointerdown", start);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", stop);
  canvas.addEventListener("pointercancel", stop);
  canvas.addEventListener("pointerleave", stop);


  el("cahierClearSignature")
    ?.addEventListener("click", clearSignature);
}


function clearSignature() {

  if (!ctx || !canvas) return;

  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  hasSignature = false;
}


// ============================================================================
// CHARGEMENT DU DOCUMENT
// ============================================================================

async function loadDocument() {

  const sb = getSupabase();

  if (!sb) {
    toast("Connexion Supabase indisponible.");
    return;
  }


  const {
    data,
    error
  } = await sb
    .from("cahier_des_charges")
    .select("*")
    .eq("actif", true)
    .order("date_publication", {
      ascending: false
    })
    .limit(1)
    .maybeSingle();


  if (error) {

    console.error(
      "[Cahier] Erreur document :",
      error
    );

    toast(
      "Impossible de charger le cahier des charges."
    );

    return;
  }


  currentDocument = data || null;

  renderDocument();
}


// ============================================================================
// AFFICHAGE DU DOCUMENT
// ============================================================================

function renderDocument() {

  const title = el("cahierTitle");
  const description = el("cahierDescription");
  const version = el("cahierVersion");
  const date = el("cahierDate");
  const viewer = el("cahierPdfViewer");
  const empty = el("cahierEmptyViewer");
  const download = el("cahierDownloadBtn");


  if (!currentDocument) {

    title.textContent = "Aucun cahier publié";

    description.textContent =
      "Le Super Admin n'a pas encore publié de cahier des charges.";

    version.textContent = "—";
    date.textContent = "—";

    viewer.style.display = "none";
    empty.style.display = "block";

    download.disabled = true;

    return;
  }


  title.textContent =
    currentDocument.titre ||
    "Cahier des charges";


  description.textContent =
    currentDocument.description ||
    "Document de référence de la plateforme.";


  version.textContent =
    currentDocument.version || "—";


  date.textContent =
    formatDate(currentDocument.date_publication);


  if (currentDocument.fichier_url) {

    viewer.src =
      currentDocument.fichier_url;

    viewer.style.display = "block";
    empty.style.display = "none";

    download.disabled = false;

  } else {

    viewer.style.display = "none";
    empty.style.display = "block";

    download.disabled = true;
  }
}


// ============================================================================
// TÉLÉCHARGEMENT
// ============================================================================

function downloadDocument() {

  if (!currentDocument?.fichier_url) {

    toast(
      "Aucun fichier disponible au téléchargement."
    );

    return;
  }


  window.open(
    currentDocument.fichier_url,
    "_blank",
    "noopener,noreferrer"
  );
}


// ============================================================================
// VÉRIFIER UNE SIGNATURE EXISTANTE
// ============================================================================

async function loadExistingSignature() {

  const sb = getSupabase();

  const schoolId = getSchoolId();

  if (!sb || !schoolId || !currentDocument) {
    return;
  }


  const {
    data,
    error
  } = await sb
    .from("cahier_des_charges_signatures")
    .select("*")
    .eq("school_id", schoolId)
    .eq("document_id", currentDocument.id)
    .order("created_at", {
      ascending: false
    })
    .limit(1)
    .maybeSingle();


  if (error) {

    console.error(
      "[Cahier] Erreur signature :",
      error
    );

    return;
  }


  currentSignature = data || null;

  renderSignatureState();
}


// ============================================================================
// ÉTAT SIGNATURE
// ============================================================================

function renderSignatureState() {

  const signCard =
    el("cahierSignatureCard");

  const submittedCard =
    el("cahierSubmittedCard");

  const status =
    el("cahierStatus");

  if (!currentSignature) {

    signCard.style.display = "none";
    submittedCard.style.display = "none";

    status.innerHTML =
      `<span class="badge orange">Non signé</span>`;

    return;
  }


  if (
    currentSignature.statut === "en_attente"
  ) {

    signCard.style.display = "none";
    submittedCard.style.display = "block";

    status.innerHTML =
      `<span class="badge orange">En attente de validation</span>`;

    el("cahierSubmittedMessage").textContent =
      `Le cahier des charges a été signé par ${
        currentSignature.nom_signataire
      } et transmis à Chift Digital le ${
        formatDate(currentSignature.date_envoi)
      }.`;

    return;
  }


  if (
    currentSignature.statut === "valide"
  ) {

    signCard.style.display = "none";
    submittedCard.style.display = "block";

    status.innerHTML =
      `<span class="badge green">Validé</span>`;

    el("cahierSubmittedMessage").textContent =
      `Le document signé par ${
        currentSignature.nom_signataire
      } a été validé par Chift Digital.`;

    return;
  }


  if (
    currentSignature.statut === "renvoye"
  ) {

    signCard.style.display = "block";
    submittedCard.style.display = "none";

    status.innerHTML =
      `<span class="badge red">À corriger</span>`;

    if (currentSignature.motif_renvoi) {

      toast(
        "Document retourné : " +
        currentSignature.motif_renvoi
      );
    }

    return;
  }


  signCard.style.display = "none";
  submittedCard.style.display = "none";
}


// ============================================================================
// OUVRIR FORMULAIRE SIGNATURE
// ============================================================================

function openSignatureForm() {

  if (!currentDocument) {

    toast(
      "Aucun cahier des charges disponible."
    );

    return;
  }


  if (
    currentSignature &&
    currentSignature.statut !== "renvoye"
  ) {

    toast(
      "Ce document a déjà été transmis."
    );

    return;
  }


  el("cahierSignatureCard").style.display =
    "block";


  el("cahierSignatureCard")
    .scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
}


// ============================================================================
// ENVOI DE LA SIGNATURE
// ============================================================================

async function submitSignature() {

  const sb = getSupabase();

  if (!sb) {

    toast(
      "Connexion Supabase indisponible."
    );

    return;
  }


  if (!currentDocument) {

    toast(
      "Aucun document disponible."
    );

    return;
  }


  const name =
    el("cahierSignerName")
      ?.value
      ?.trim();


  const fonction =
    el("cahierSignerFunction")
      ?.value
      ?.trim();


  const consent =
    el("cahierConsent")
      ?.checked;


  if (!name) {

    toast(
      "Veuillez renseigner le nom du signataire."
    );

    return;
  }


  if (!fonction) {

    toast(
      "Veuillez renseigner la fonction du signataire."
    );

    return;
  }


  if (!hasSignature) {

    toast(
      "Veuillez dessiner votre signature."
    );

    return;
  }


  if (!consent) {

    toast(
      "Vous devez confirmer votre consentement."
    );

    return;
  }


  const {
    data: {
      user
    }
  } = await sb.auth.getUser();


  if (!user) {

    toast(
      "Votre session a expiré. Reconnectez-vous."
    );

    return;
  }


  const schoolId = getSchoolId();


  if (!schoolId) {

    toast(
      "Impossible d'identifier votre établissement."
    );

    return;
  }


  const signatureData =
    canvas.toDataURL("image/png");


  const button =
    el("cahierSubmitSignature");


  button.disabled = true;
  button.textContent =
    "Envoi en cours…";


  try {

    /*
     * Si le document avait été retourné,
     * on met à jour la signature existante.
     */

    if (
      currentSignature &&
      currentSignature.statut === "renvoye"
    ) {

      const {
        data,
        error
      } = await sb
        .from("cahier_des_charges_signatures")
        .update({

          signataire_id: user.id,

          nom_signataire: name,

          fonction_signataire: fonction,

          signature_data: signatureData,

          version_document:
            currentDocument.version,

          statut: "en_attente",

          date_signature: new Date().toISOString(),

          date_envoi: new Date().toISOString(),

          date_validation: null,

          motif_renvoi: null

        })
        .eq("id", currentSignature.id)
        .select()
        .single();


      if (error) throw error;

      currentSignature = data;

    } else {

      const {
        data,
        error
      } = await sb
        .from("cahier_des_charges_signatures")
        .insert({

          document_id:
            currentDocument.id,

          school_id:
            schoolId,

          signataire_id:
            user.id,

          nom_signataire:
            name,

          fonction_signataire:
            fonction,

          signature_data:
            signatureData,

          version_document:
            currentDocument.version,

          statut:
            "en_attente",

          date_signature:
            new Date().toISOString(),

          date_envoi:
            new Date().toISOString()

        })
        .select()
        .single();


      if (error) throw error;

      currentSignature = data;
    }


    toast(
      "✅ Cahier des charges signé et transmis."
    );


    renderSignatureState();


    /*
     * Réinitialisation du formulaire.
     */

    el("cahierConsent").checked = false;

    clearSignature();


  } catch (error) {

    console.error(
      "[Cahier] Erreur signature :",
      error
    );

    toast(
      "Erreur lors de l'envoi : " +
      error.message
    );

  } finally {

    button.disabled = false;

    button.textContent =
      "✍️ Signer et envoyer";
  }
}


// ============================================================================
// MONTAGE
// ============================================================================

export function mount() {

  if (mounted) return;

  mounted = true;


  setupCanvas();


  el("cahierDownloadBtn")
    ?.addEventListener(
      "click",
      downloadDocument
    );


  el("cahierSignBtn")
    ?.addEventListener(
      "click",
      openSignatureForm
    );


  el("cahierSubmitSignature")
    ?.addEventListener(
      "click",
      submitSignature
    );
}


// ============================================================================
// REFRESH
// ============================================================================

export async function refresh() {

  if (!mounted) {
    mount();
  }


  await loadDocument();

  await loadExistingSignature();
}
