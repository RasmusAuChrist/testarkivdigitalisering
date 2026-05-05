// /js/page_auth.js
import { getToken, clearToken, requireLogin } from "./auth.js";
import { initUserMenu } from "./user_menu.js";

export const API_BASE =
  "https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net";

export function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: authHeaders(),
  });

  return handleApiResponse(res);
}

export async function apiPost(path, body = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(body),
  });

  return handleApiResponse(res);
}

async function handleApiResponse(res) {
  if (res.status === 401) {
    clearToken();
    requireLogin();
    throw new Error("Ikke innlogget.");
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.detail || data?.error || "Ukjent feil.");
  }

  return data;
}

export async function loadNavbar() {
  const container = document.getElementById("navbar-container");
  if (!container) return;

  try {
    const res = await fetch("/partials/navbar.html");
    container.innerHTML = await res.text();
  } catch {
    try {
      const res = await fetch("/navbar.html");
      container.innerHTML = await res.text();
    } catch {
      container.innerHTML = "";
    }
  }
}

export async function initProtectedPage() {
  await loadNavbar();

  if (!requireLogin()) return null;

  const me = await apiGet("/api/auth/me");
  initUserMenu(me);

  return me;
}