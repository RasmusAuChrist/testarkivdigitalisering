// /js/user_menu.js
import { clearToken } from "./auth.js";

/**
 * Initializes a simple dropdown user menu.
 *
 * Required HTML IDs:
 * - userMenuBtn
 * - userMenuDropdown
 * - userMenuName (optional)
 * - userMenuAdminItem (optional wrapper for admin link)
 * - userMenuLogout
 *
 * @param {object|null} me  The /api/auth/me response (or null if unknown)
 * @param {object} [opts]
 * @param {string} [opts.loginUrl="/views/login.html"]
 * @param {string} [opts.accountUrl="/views/account.html"]
 * @param {string} [opts.adminUsersUrl="/views/admin_users.html"]
 */
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

  // Fill label
  if (nameEl && me?.username) {
    nameEl.textContent = me.username;
  }

  // Admin item visibility
  const isAdmin = !!me?.roles?.includes("Admin");
  if (adminItem) {
    adminItem.style.display = isAdmin ? "" : "none";
    const a = adminItem.querySelector("a");
    if (a) a.setAttribute("href", adminUsersUrl);
  }

  // Account link
  const accountLink = dd.querySelector('a[data-action="account"]');
  if (accountLink) accountLink.setAttribute("href", accountUrl);

  // Toggle dropdown
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
    e.stopPropagation();
    toggle();
  });

  // Close on outside click
  document.addEventListener("click", (e) => {
    if (!dd.contains(e.target) && !btn.contains(e.target)) close();
  });

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  // Logout
  logoutBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    clearToken();
    window.location.assign(loginUrl);
  });

  // Default closed
  close();
}