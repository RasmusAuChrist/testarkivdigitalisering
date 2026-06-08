import { setToken } from "./auth.js";

const API_BASE = "https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net";

function getNextUrl() {
  const next = new URLSearchParams(window.location.search).get("next");
  return next || "/views/serie_hierarchy.html";
}

function getLoginContext() {
  try {
    const nextUrl = new URL(getNextUrl(), window.location.origin);
    return nextUrl.pathname === "/views/arkiv_infoscreen.html" ? "arkiv_infoscreen" : null;
  } catch {
    return null;
  }
}

function showError(msg) {
  const el = document.getElementById("err");
  el.textContent = msg;
  el.style.display = "block";
}

async function login(username, password) {

  const remember = document.getElementById("rememberMe").checked;
  
   const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      password,
      remember,
      login_context: getLoginContext()
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.detail || "Innlogging feilet.");
  }
  return data;
}

document.getElementById("loginBtn").addEventListener("click", async () => {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  if (!username || !password) {
    showError("Brukernavn og passord må fylles ut.");
    return;
  }

  try {
    const data = await login(username, password);
    const remember = document.getElementById("rememberMe").checked;
    setToken(data.access_token, remember);    window.location.assign(getNextUrl());
  } catch (e) {
    showError(e.message || "Innlogging feilet.");
  }
});
