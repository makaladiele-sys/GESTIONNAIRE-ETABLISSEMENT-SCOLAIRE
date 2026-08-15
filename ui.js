// ==========================================================================
// Helpers d'interface : toasts, modales, navigation entre pages, sidebar.
// ==========================================================================
export function toast(msg, ms = 2800) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), ms);
}

export function openModal(id) {
  document.getElementById(id)?.classList.add("open");
}
export function closeModal(id) {
  document.getElementById(id)?.classList.remove("open");
}
export function closeAllModals() {
  document.querySelectorAll(".modal.open").forEach((m) => m.classList.remove("open"));
}

const pageTitles = {
  dashboard: "Tableau de bord",
  students: "Élèves",
  parents: "Parents / Tuteurs",
  teachers: "Enseignants & RH",
  classes: "Classes",
  subjects: "Matières",
  grades: "Notes",
  attendance: "Présences",
  payments: "Paiements",
  cash: "Caisse & Dépenses",
  bulletins: "Bulletins",
  communication: "Communication",
  reports: "Rapports",
  settings: "Paramètres",
  users: "Utilisateurs & Rôles",
  superadmin: "Super Admin",
};

let onNavigate = () => {};
export function setNavigateHandler(fn) {
  onNavigate = fn;
}

export function showPage(id) {
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  document.getElementById(id)?.classList.add("active");
  document.querySelectorAll(".nav button[data-page]").forEach((b) => {
    b.classList.toggle("active", b.dataset.page === id);
  });
  const mobileTitle = document.getElementById("pageTitleMobile");
  if (mobileTitle) mobileTitle.textContent = pageTitles[id] || "";
  if (window.innerWidth < 801) closeSidebar();
  onNavigate(id);
}

export function openSidebar() {
  document.getElementById("sidebar")?.classList.add("open");
  document.getElementById("sidebarBackdrop")?.classList.add("show");
}
export function closeSidebar() {
  document.getElementById("sidebar")?.classList.remove("open");
  document.getElementById("sidebarBackdrop")?.classList.remove("show");
}
export function toggleSidebar() {
  document.getElementById("sidebar")?.classList.contains("open") ? closeSidebar() : openSidebar();
}

export function fmtMoney(n, currency = "FCFA") {
  const v = Number(n || 0);
  return v.toLocaleString("fr-FR") + " " + currency;
}

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
