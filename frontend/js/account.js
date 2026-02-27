import { getToken, clearToken } from "./auth.js";
import { initUserMenu } from "./user_menu.js";

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

document.addEventListener("DOMContentLoaded", async () => {
  await loadNavbar();

  if (!ensureLoggedIn()) return;

  try {
    setMsg("Laster…");
    const me = await apiGet("/api/auth/me");

    document.getElementById("profileBox").innerHTML = `
      <div><b>Brukernavn:</b> ${me.username}</div>
      <div><b>Roller:</b> ${(me.roles || []).join(", ")}</div>
    `;

    if (me.must_change_password) {
      document.getElementById("mustChangeBox").style.display = "block";
    }

    setMsg("");
  } catch (e) {
    setMsg(e.message || "Feil", true);
    return;
  }

  document.getElementById("changePwdBtn").addEventListener("click", async () => {
    try {
      const old_password = document.getElementById("oldPwd").value;
      const new_password = document.getElementById("newPwd").value;
      const new_password_2 = document.getElementById("newPwd2").value;

      if (!old_password || !new_password) {
        setMsg("Fyll ut alle felter.", true);
        return;
      }
      if (new_password !== new_password_2) {
        setMsg("Nytt passord matcher ikke.", true);
        return;
      }
      if (new_password.length < 6) {
      setMsg("Nytt passord må være minst 6 tegn.", true);
      return;
      }

      setMsg("Bytter passord…");
      await apiPost("/api/account/change-password", { old_password, new_password });
      setMsg("Passord oppdatert.");
      document.getElementById("oldPwd").value = "";
      document.getElementById("newPwd").value = "";
      document.getElementById("newPwd2").value = "";
      document.getElementById("mustChangeBox").style.display = "none";
    } catch (e) {
      setMsg(e.message || "Feil ved passordbytte.", true);
    }
  });
});