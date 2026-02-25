import { getToken, clearToken } from "./auth.js";

const API_BASE = "https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net";

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function ensureLoggedIn() {
  const token = getToken();
  if (!token) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.assign(`/views/login.html?next=${next}`);
    return false;
  }
  return true;
}

function setMsg(text, isError = false) {
  const el = document.getElementById("msg");
  el.textContent = text || "";
  el.style.color = isError ? "#ffb4b4" : "#ffffff";
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers: { ...authHeaders() } });

  if (res.status === 401) {
    clearToken();
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.assign(`/views/login.html?next=${next}`);
    throw new Error("Ikke innlogget.");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || "Ukjent feil");
  return data;
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body ?? {}),
  });

  if (res.status === 401) {
    clearToken();
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.assign(`/views/login.html?next=${next}`);
    throw new Error("Ikke innlogget.");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || "Ukjent feil");
  return data;
}

async function loadNavbar() {
  const container = document.getElementById("navbar-container");
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

function fillRoleSelect(selectEl, roles) {
  // roles: [{RoleId, Name}, ...]
  selectEl.innerHTML = roles
    .map(r => `<option value="${r.Name}">${r.Name}</option>`)
    .join("");

  // default preference
  const hasOperator = roles.some(r => r.Name === "Operator");
  if (hasOperator) selectEl.value = "Operator";
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadNavbar();

  document.getElementById("logoutBtn").addEventListener("click", () => {
    clearToken();
    window.location.assign("/views/login.html");
  });

  if (!ensureLoggedIn()) return;

  // Must be admin
  let me;
  try {
    setMsg("Laster…");
    me = await apiGet("/api/auth/me");
    if (!me?.roles?.includes("Admin")) {
      setMsg("Ikke tilgang (Admin kreves).", true);
      return;
    }
  } catch (e) {
    setMsg(e.message || "Feil", true);
    return;
  }

  // Load roles for dropdowns
  let roles = [];
  try {
    const res = await apiGet("/api/admin/roles");
    roles = res.roles || [];
    fillRoleSelect(document.getElementById("cu_role"), roles);
    fillRoleSelect(document.getElementById("sr_role"), roles);
    setMsg("");
  } catch (e) {
    setMsg(e.message || "Kunne ikke hente roller.", true);
    return;
  }

// Create user
document.getElementById("createUserBtn").addEventListener("click", async () => {
  try {
    const username = document.getElementById("cu_username").value.trim();
    const display_name = document.getElementById("cu_displayName").value.trim() || null;
    const temp_password = document.getElementById("cu_tempPassword").value;
    const must_change_password = document.getElementById("cu_mustChange").checked;
    const role_name = document.getElementById("cu_role").value;

    if (!username || !temp_password) {
      setMsg("Brukernavn og midlertidig passord må fylles ut.", true);
      return;
    }

    setMsg("Oppretter bruker…");

    const created = await apiPost("/api/admin/users", {
      username,
      display_name,
      temp_password,
      must_change_password,
      role_name
    });

    setMsg(`Bruker opprettet (UserId: ${created.UserId ?? "ukjent"}).`);
  } catch (e) {
    setMsg(e.message || "Feil ved oppretting.", true);
  }
});

// Reset password
document.getElementById("resetPwdBtn").addEventListener("click", async () => {
  try {
    const user_id = Number(document.getElementById("rp_userId").value);
    const temp_password = document.getElementById("rp_tempPassword").value;
    const must_change_password = document.getElementById("rp_mustChange").checked;

    if (!user_id || !temp_password) {
      setMsg("Bruker-ID og midlertidig passord må fylles ut.", true);
      return;
    }

    setMsg("Nullstiller passord…");

    await apiPost("/api/admin/users/reset-password", {
      user_id,
      temp_password,
      must_change_password
    });

    setMsg("Passord nullstilt.");
  } catch (e) {
    setMsg(e.message || "Feil ved nullstilling.", true);
  }
});

  // Set role (enable/disable)
  document.getElementById("setRoleBtn").addEventListener("click", async () => {
    try {
      const user_id = Number(document.getElementById("sr_userId").value);
      const role_name = document.getElementById("sr_role").value;
      const is_enabled = document.getElementById("sr_enabled").checked;

      if (!user_id || !role_name) {
        setMsg("Bruker-ID og rolle må fylles ut.", true);
        return;
      }

      setMsg("Oppdaterer rolle…");
      await apiPost("/api/admin/users/set-role", { user_id, role_name, is_enabled });

      setMsg(is_enabled ? "Rolle aktivert." : "Rolle fjernet.");
    } catch (e) {
      setMsg(e.message || "Feil ved rolleoppdatering.", true);
    }
  });
});