import { clearToken } from "./auth.js";

export function initUserMenu(me, opts = {}) {
  const {
    loginUrl = "/views/login.html",
    accountUrl = "/views/account.html",
    adminUsersUrl = "/views/admin_users.html",
  } = opts;

  const btn = document.getElementById("userMenuBtn");
  const dd = document.getElementById("userMenuDropdown");
  if (!btn || !dd) return;

  const nameEl = document.getElementById("userMenuName");
  const adminItem = document.getElementById("userMenuAdminItem");
  const logoutBtn = document.getElementById("userMenuLogout");

  // --- Update UI (can run multiple times) ---
  if (nameEl && me?.username) nameEl.textContent = me.username;

  const isAdmin = !!me?.roles?.includes("Admin");
  if (adminItem) {
    adminItem.style.display = isAdmin ? "" : "none";
    const a = adminItem.querySelector("a");
    if (a) a.setAttribute("href", adminUsersUrl);
  }

  const accountLink = dd.querySelector('a[data-action="account"]');
  if (accountLink) accountLink.setAttribute("href", accountUrl);

  // --- Bind events only once ---
  if (btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";

  function open() {
    dd.style.display = "block";
    btn.setAttribute("aria-expanded", "true");
  }
  function close() {
    dd.style.display = "none";
    btn.setAttribute("aria-expanded", "false");
  }
  function toggle() {
    if (dd.style.display === "block") close();
    else open();
  }

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation(); // critical so document click doesn't instantly close it
    toggle();
  });

  document.addEventListener("click", (e) => {
    if (!dd.contains(e.target) && !btn.contains(e.target)) close();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  logoutBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    clearToken();
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.assign(`${loginUrl}?next=${next}`);
  });

  close();
}