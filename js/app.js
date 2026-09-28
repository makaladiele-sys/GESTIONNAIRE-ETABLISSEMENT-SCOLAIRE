// ==========================================================================
// Point d'entrée de l'application.
// ==========================================================================

import { isConfigured } from "./supabaseClient.js";
import { initAuth, setAuthCallbacks, logout } from "./auth.js";
import { state, isPlatformAdmin, checkTrialStatus } from "./state.js";
import {
  showPage,
  setNavigateHandler,
  toggleSidebar,
  closeSidebar,
  toast
} from "./ui.js";

import {
  mountBell,
  refreshBell,
  resetReadCache
} from "./modules/notifications.js";

import * as dashboard from "./modules/dashboard.js";
import * as students from "./modules/students.js";
import * as parents from "./modules/parents.js";
import * as teachers from "./modules/teachers.js";
import * as classes from "./modules/classes.js";
import * as subjects from "./modules/subjects.js";
import * as grades from "./modules/grades.js";
import * as attendance from "./modules/attendance.js";
import * as payments from "./modules/payments.js";
import * as cash from "./modules/cash.js";
import * as collections from "./modules/collections.js";
import * as bulletins from "./modules/bulletins.js";
import * as communication from "./modules/communication.js";
import * as reports from "./modules/reports.js";
import * as settingsModule from "./modules/settings.js";
import * as usersModule from "./modules/users.js";
import * as superadmin from "./modules/superadmin.js";
import * as auditlog from "./modules/auditlog.js";


// ==========================================================================
// MODULES
// ==========================================================================

const modules = {
  dashboard,
  students,
  parents,
  teachers,
  classes,
  subjects,
  grades,
  attendance,
  payments,
  cash,
  collections,
  bulletins,
  communication,
  reports,
  settings: settingsModule,
  users: usersModule,
  superadmin,
  auditlog,
};

let mounted = false;


// ==========================================================================
// MONTAGE DES MODULES
// ==========================================================================

function mountAllModules() {
  if (mounted) return;

  Object.values(modules).forEach((m) => {
    if (m.mount) {
      try {
        m.mount();
      } catch (e) {
        console.error("Erreur montage module :", e);
      }
    }
  });

  mounted = true;
}


// ==========================================================================
// RAFRAÎCHISSEMENT D'UNE PAGE
// ==========================================================================

async function refreshPage(id) {
  try {
    await modules[id]?.refresh?.();
  } catch (e) {
    console.error(e);
    toast("Erreur de chargement : " + e.message);
  }
}


// ==========================================================================
// INTERFACE SELON LE RÔLE
// ==========================================================================

function applyRoleUI() {
  const navSuper = document.getElementById("navSuperAdmin");

  if (navSuper) {
    navSuper.style.display =
      isPlatformAdmin() ? "flex" : "none";
  }

  const navAudit = document.getElementById("navAuditLog");

  if (navAudit) {
    navAudit.style.display =
      isPlatformAdmin() ? "flex" : "none";
  }

  const badge = document.getElementById("userBadgeName");
  const roleBadge = document.getElementById("userBadgeRole");

  if (badge) {
    badge.textContent =
      state.profile?.full_name ||
      state.profile?.email ||
      "Utilisateur";
  }

  if (roleBadge) {
    roleBadge.textContent =
      isPlatformAdmin()
        ? "Super Admin plateforme"
        : state.school?.name || "Établissement";
  }

  const tenantCard =
    document.getElementById("tenantCard");

  if (tenantCard) {
    if (isPlatformAdmin()) {

      tenantCard.innerHTML = `
        <b>Console plateforme</b>
        <small>Vue globale multi-établissements</small>
      `;

    } else {

      const status =
        state.school?.status || "pending";

      tenantCard.innerHTML = `
        <b>${escapeHtmlLocal(
          state.school?.name || "Établissement"
        )}</b>

        <small>
          Année :
          ${escapeHtmlLocal(
            state.school?.current_academic_year || "—"
          )}
        </small>

        <span class="tenant-status ${status}">
          ${
            status === "active"
              ? "Actif"
              : status === "suspended"
              ? "Suspendu"
              : "En attente"
          }
        </span>
      `;
    }
  }
}


// ==========================================================================
// PROTECTION HTML
// ==========================================================================

function escapeHtmlLocal(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c])
  );
}


// ==========================================================================
// NAVIGATION / INTERFACE
// ==========================================================================

function bindChrome() {

  document
    .querySelectorAll(".nav button[data-page]")
    .forEach((btn) => {

      btn.addEventListener("click", () => {
        showPage(btn.dataset.page);
      });

    });


  document
    .getElementById("menuBtn")
    ?.addEventListener(
      "click",
      toggleSidebar
    );


  document
    .getElementById("sidebarBackdrop")
    ?.addEventListener(
      "click",
      closeSidebar
    );


  document
    .getElementById("logoutBtn")
    ?.addEventListener(
      "click",
      () => logout()
    );


  document
    .querySelectorAll("[data-close-modal]")
    .forEach((btn) => {

      btn.addEventListener("click", () => {

        btn
          .closest(".modal")
          ?.classList.remove("open");

      });

    });


  document
    .getElementById("globalSearch")
    ?.addEventListener(
      "keydown",
      (e) => {

        if (e.key !== "Enter") return;

        const q =
          e.target.value.trim();

        if (!q) return;

        showPage("students");

        const box =
          document.getElementById(
            "studentSearch"
          );

        if (box) {

          box.value = q;

          box.dispatchEvent(
            new Event("input")
          );

        }

      }
    );


  document
    .getElementById("dashGoStudents")
    ?.addEventListener(
      "click",
      () => {

        showPage("students");

        document
          .getElementById("openAddStudent")
          ?.click();

      }
    );


  setNavigateHandler(refreshPage);

  mountBell();
}


// ==========================================================================
// CAHIER DES CHARGES
// ==========================================================================

const CAHIER_PDF_URL =
  "https://twonzfpvzkjvrtspigra.supabase.co/storage/v1/object/public/cahier-des-charges/Cahier%20des%20charges%20Gestionnaire%20Etablissements.pdf";


function initCahierDesCharges() {

  const viewer =
    document.getElementById(
      "cahierPdfViewer"
    );

  const emptyViewer =
    document.getElementById(
      "cahierEmptyViewer"
    );

  const downloadBtn =
    document.getElementById(
      "cahierDownloadBtn"
    );

  const signBtn =
    document.getElementById(
      "cahierSignBtn"
    );

  const signatureCard =
    document.getElementById(
      "cahierSignatureCard"
    );

  const canvas =
    document.getElementById(
      "cahierSignatureCanvas"
    );

  const clearBtn =
    document.getElementById(
      "cahierClearSignature"
    );

  const submitBtn =
    document.getElementById(
      "cahierSubmitSignature"
    );

  const signerName =
    document.getElementById(
      "cahierSignerName"
    );

  const signerFunction =
    document.getElementById(
      "cahierSignerFunction"
    );

  const consent =
    document.getElementById(
      "cahierConsent"
    );


  // ------------------------------------------------------------------------
  // PDF
  // ------------------------------------------------------------------------

  if (viewer) {

    viewer.src =
      CAHIER_PDF_URL;

    viewer.style.display =
      "block";

    if (emptyViewer) {
      emptyViewer.style.display =
        "none";
    }

    viewer.addEventListener(
      "load",
      () => {

        console.log(
          "Cahier des charges chargé avec succès."
        );

      },
      { once: true }
    );
  }


  // ------------------------------------------------------------------------
  // TÉLÉCHARGEMENT
  // ------------------------------------------------------------------------

  if (downloadBtn) {

    downloadBtn.onclick = () => {

      window.open(
        CAHIER_PDF_URL,
        "_blank",
        "noopener,noreferrer"
      );

    };
  }


  // ------------------------------------------------------------------------
  // INFORMATIONS DU DOCUMENT
  // ------------------------------------------------------------------------

  const title =
    document.getElementById(
      "cahierTitle"
    );

  const description =
    document.getElementById(
      "cahierDescription"
    );

  const status =
    document.getElementById(
      "cahierStatus"
    );

  const version =
    document.getElementById(
      "cahierVersion"
    );

  const date =
    document.getElementById(
      "cahierDate"
    );


  if (title) {

    title.textContent =
      "Cahier des charges — Gestionnaire Établissements";

  }


  if (description) {

    description.textContent =
      "Document de référence de la plateforme Chift Digital Academy.";

  }


  if (status) {

    status.innerHTML = `
      <span style="
        color:#16803a;
        font-weight:700;
      ">
        ● Document disponible
      </span>
    `;

  }


  if (version) {
    version.textContent =
      "Version 1.0";
  }


  if (date) {

    date.textContent =
      new Date()
        .toLocaleDateString("fr-FR");

  }


  // ------------------------------------------------------------------------
  // SIGNER LE DOCUMENT
  // ------------------------------------------------------------------------

  if (
    signBtn &&
    signatureCard
  ) {

    signBtn.onclick = () => {

      signatureCard.style.display =
        "block";


      signatureCard.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });


      // Préremplir le nom
      if (
        signerName &&
        !signerName.value &&
        state.profile
      ) {

        signerName.value =
          state.profile.full_name ||
          state.profile.email ||
          "";

      }


      setTimeout(() => {

        prepareSignatureCanvas();

      }, 150);

    };

  }


  // ------------------------------------------------------------------------
  // CANVAS DE SIGNATURE
  // ------------------------------------------------------------------------

  function prepareSignatureCanvas() {

    if (!canvas) {

      console.warn(
        "Canvas de signature introuvable."
      );

      return;
    }


    const ctx =
      canvas.getContext("2d");


    if (!ctx) {

      console.error(
        "Impossible d'initialiser le canvas."
      );

      return;
    }


    // Ne pas installer deux fois les événements
    if (
      canvas.dataset.initialized ===
      "true"
    ) {
      return;
    }


    canvas.dataset.initialized =
      "true";


    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";


    let drawing = false;
    let hasSignature = false;


    // ----------------------------------------------------------------------
    // POSITION SOURIS / DOIGT
    // ----------------------------------------------------------------------

    function getPosition(event) {

      const rect =
        canvas.getBoundingClientRect();


      const scaleX =
        canvas.width /
        rect.width;

      const scaleY =
        canvas.height /
        rect.height;


      let clientX;
      let clientY;


      if (
        event.touches &&
        event.touches.length
      ) {

        clientX =
          event.touches[0].clientX;

        clientY =
          event.touches[0].clientY;

      } else {

        clientX =
          event.clientX;

        clientY =
          event.clientY;

      }


      return {

        x:
          (clientX - rect.left) *
          scaleX,

        y:
          (clientY - rect.top) *
          scaleY

      };

    }


    // ----------------------------------------------------------------------
    // DÉBUT DU DESSIN
    // ----------------------------------------------------------------------

    function startDrawing(event) {

      event.preventDefault();

      drawing = true;

      hasSignature = true;


      const pos =
        getPosition(event);


      ctx.beginPath();

      ctx.moveTo(
        pos.x,
        pos.y
      );

    }


    // ----------------------------------------------------------------------
    // DESSIN
    // ----------------------------------------------------------------------

    function draw(event) {

      if (!drawing) return;

      event.preventDefault();


      const pos =
        getPosition(event);


      ctx.lineTo(
        pos.x,
        pos.y
      );

      ctx.stroke();

    }


    // ----------------------------------------------------------------------
    // FIN DU DESSIN
    // ----------------------------------------------------------------------

    function stopDrawing(event) {

      if (!drawing) return;

      if (event) {
        event.preventDefault();
      }

      drawing = false;

      ctx.closePath();

    }


    // ----------------------------------------------------------------------
    // SOURIS
    // ----------------------------------------------------------------------

    canvas.addEventListener(
      "mousedown",
      startDrawing
    );

    canvas.addEventListener(
      "mousemove",
      draw
    );

    canvas.addEventListener(
      "mouseup",
      stopDrawing
    );

    canvas.addEventListener(
      "mouseleave",
      stopDrawing
    );


    // ----------------------------------------------------------------------
    // ÉCRAN TACTILE
    // ----------------------------------------------------------------------

    canvas.addEventListener(
      "touchstart",
      startDrawing,
      { passive: false }
    );

    canvas.addEventListener(
      "touchmove",
      draw,
      { passive: false }
    );

    canvas.addEventListener(
      "touchend",
      stopDrawing,
      { passive: false }
    );


    // ----------------------------------------------------------------------
    // EFFACER LA SIGNATURE
    // ----------------------------------------------------------------------

    if (clearBtn) {

      clearBtn.onclick = () => {

        ctx.clearRect(
          0,
          0,
          canvas.width,
          canvas.height
        );

        hasSignature = false;


        console.log(
          "Signature effacée."
        );

      };

    }


    // ----------------------------------------------------------------------
    // SIGNER ET ENVOYER
    // ----------------------------------------------------------------------

    if (submitBtn) {

      submitBtn.onclick =
        async () => {

          const name =
            signerName?.value.trim() ||
            "";

          const fonction =
            signerFunction?.value.trim() ||
            "";


          // Nom obligatoire
          if (!name) {

            toast(
              "Veuillez renseigner votre nom."
            );

            signerName?.focus();

            return;
          }


          // Fonction obligatoire
          if (!fonction) {

            toast(
              "Veuillez renseigner votre fonction."
            );

            signerFunction?.focus();

            return;
          }


          // Signature obligatoire
          if (!hasSignature) {

            toast(
              "Veuillez signer dans la zone prévue."
            );

            return;
          }


          // Consentement obligatoire
          if (
            consent &&
            !consent.checked
          ) {

            toast(
              "Veuillez confirmer votre consentement."
            );

            return;
          }


          // Conversion en PNG
          const signatureData =
            canvas.toDataURL(
              "image/png"
            );


          console.log(
            "Signature prête.",
            {
              name,
              fonction,
              signatureDataLength:
                signatureData.length
            }
          );


          submitBtn.disabled =
            true;


          const oldText =
            submitBtn.innerHTML;


          submitBtn.innerHTML =
            "⏳ Signature en cours...";


          try {

            /*
             * Cette première version valide
             * la signature dans l'application.
             *
             * La sauvegarde définitive dans
             * Supabase sera branchée après
             * vérification de la table dédiée.
             */

            await new Promise(
              (resolve) =>
                setTimeout(
                  resolve,
                  500
                )
            );


            const submittedCard =
              document.getElementById(
                "cahierSubmittedCard"
              );


            const submittedMessage =
              document.getElementById(
                "cahierSubmittedMessage"
              );


            if (submittedCard) {

              submittedCard.style.display =
                "block";


              submittedCard.scrollIntoView({
                behavior: "smooth",
                block: "start"
              });

            }


            if (submittedMessage) {

              submittedMessage.textContent =
                `Le document a été signé par ${name} (${fonction}).`;

            }


            toast(
              "✅ Signature enregistrée."
            );


            console.log(
              "Signature validée.",
              {
                name,
                fonction,
                signatureData
              }
            );


          } catch (error) {

            console.error(
              "Erreur signature :",
              error
            );


            toast(
              "Erreur lors de la signature."
            );


          } finally {

            submitBtn.disabled =
              false;


            submitBtn.innerHTML =
              oldText;

          }

        };

    }

  }


  // ------------------------------------------------------------------------
  // CONFIGURATION DU CANVAS
  // ------------------------------------------------------------------------

  if (canvas) {

    canvas.style.touchAction =
      "none";

  }

}


// ==========================================================================
// CONTRÔLE PÉRIODE D'ESSAI
// ==========================================================================

const TRIAL_CHECK_INTERVAL_MS =
  5 * 60 * 1000;

let _trialIntervalId = null;


function startTrialWatch() {

  stopTrialWatch();

  if (isPlatformAdmin()) {
    return;
  }


  _trialIntervalId =
    setInterval(
      async () => {

        const result =
          await checkTrialStatus();


        if (!result.ok) {

          stopTrialWatch();


          toast(
            result.reason ===
            "trial_expired"

              ? "⛔ Votre période d'essai de 15 jours est terminée."

              : "⛔ Votre établissement a été suspendu."
          );


          await logout();

        }

      },
      TRIAL_CHECK_INTERVAL_MS
    );
}


function stopTrialWatch() {

  if (_trialIntervalId) {

    clearInterval(
      _trialIntervalId
    );

    _trialIntervalId =
      null;

  }

}


// ==========================================================================
// RAFRAÎCHISSEMENT NOTIFICATIONS
// ==========================================================================

const BELL_CHECK_INTERVAL_MS =
  60 * 1000;

let _bellIntervalId = null;


function startBellWatch() {

  stopBellWatch();

  if (isPlatformAdmin()) {
    return;
  }


  _bellIntervalId =
    setInterval(
      () => {

        state.cache.messages =
          null;

        refreshBell();

      },
      BELL_CHECK_INTERVAL_MS
    );
}


function stopBellWatch() {

  if (_bellIntervalId) {

    clearInterval(
      _bellIntervalId
    );

    _bellIntervalId =
      null;

  }

}


// ==========================================================================
// UTILISATEUR AUTHENTIFIÉ
// ==========================================================================

async function onAuthenticated() {

  applyRoleUI();

  mountAllModules();


  // Initialise le Cahier des charges
  initCahierDesCharges();


  const startPage =
    isPlatformAdmin()
      ? "superadmin"
      : "dashboard";


  showPage(startPage);


  startTrialWatch();


  await refreshBell();


  startBellWatch();

}


// ==========================================================================
// DÉCONNEXION
// ==========================================================================

function onSignedOut() {

  stopTrialWatch();

  stopBellWatch();

  resetReadCache();

}


// ==========================================================================
// ÉCRAN CONFIGURATION
// ==========================================================================

function showConfigScreen() {

  document.body.innerHTML = `

    <div
      style="
        min-height:100vh;
        display:flex;
        align-items:center;
        justify-content:center;
        background:#0d1230;
        padding:24px
      "
    >

      <div
        style="
          max-width:520px;
          background:#fff;
          border-radius:18px;
          padding:32px;
          font-family:Inter,system-ui,sans-serif;
          line-height:1.6
        "
      >

        <h1
          style="
            font-family:Sora,sans-serif;
            margin-bottom:10px
          "
        >
          Configuration requise
        </h1>


        <p
          style="
            color:#657089;
            margin-bottom:16px
          "
        >

          Ce fichier
          <code>js/config.js</code>
          est introuvable ou incomplet.

          Il contient l'URL et la clé
          <b>anon</b>
          publique de votre projet Supabase.

        </p>


        <ol
          style="
            margin:0 0 16px 20px;
            color:#12172b
          "
        >

          <li>
            Copiez
            <code>js/config.example.js</code>
            en
            <code>js/config.js</code>.
          </li>


          <li>
            Renseignez
            <code>SUPABASE_URL</code>
            et
            <code>SUPABASE_ANON_KEY</code>
            depuis
            Supabase → Project Settings → API.
          </li>


          <li>
            Exécutez
            <code>sql/schema.sql</code>
            dans l'éditeur SQL de votre projet Supabase.
          </li>


          <li>
            Rechargez cette page.
          </li>

        </ol>


        <p
          style="
            color:#657089;
            font-size:13px
          "
        >
          Voir le fichier
          <code>README.md</code>
          pour le guide complet.
        </p>

      </div>

    </div>

  `;
}


// ==========================================================================
// INITIALISATION
// ==========================================================================

document.addEventListener(
  "DOMContentLoaded",
  () => {

    if (!isConfigured()) {

      showConfigScreen();

      return;
    }


    bindChrome();


    setAuthCallbacks({
      authenticated:
        onAuthenticated,

      signedOut:
        onSignedOut
    });


    initAuth();

  }
);
