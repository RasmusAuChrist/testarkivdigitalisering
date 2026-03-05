import { getToken, clearToken } from "./auth.js";
import { initUserMenu } from "./user_menu.js";

const API_BASE = "https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net";

let lastOrder = null; // { header, steps, events }

function setMsg(text, isError = false) {
  const el = document.getElementById("msg");
  if (!el) return;
  el.textContent = text || "";
  el.style.color = isError ? "#ffb4b4" : "#ffffff";
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
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

async function initMeForMenu() {
  try {
    const me = await apiGet("/api/auth/me");
    initUserMenu(me);
  } catch {
    // apiGet already redirects on 401
  }
}

async function loadNavbar() {
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

function fmtDate(v) {
  if (!v) return "";
  try {
    const d = new Date(v);
    return d.toLocaleString("no-NO");
  } catch {
    return String(v);
  }
}

function escapeHtml(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusBadge(status) {
  const color =
    status === "Active" ? "#16a34a" :
    status === "Pending" ? "#ca8a04" :
    status === "Completed" ? "#2563eb" :
    status === "OnHold" || status === "Blocked" ? "#b91c1c" :
    status === "Stopped" ? "#111827" :
    "#374151";

  return `<span style="display:inline-flex; padding:2px 8px; border-radius:999px; background:${color}; color:#fff; font-weight:700; font-size:12px;">${escapeHtml(status)}</span>`;
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

function renderHeader(header) {
  const card = document.getElementById("headerCard");
  const grid = document.getElementById("headerGrid");
  if (!card || !grid) return;

  card.style.display = "block";

  const fields = [
    ["OrdreId", header.OrderId],
    ["_amid", header.ExternalAmid],
    ["Batch", header.BatchNo ?? ""],
    ["Tittel", header.Title ?? ""],
    ["Status", header.Status],
    ["Prioritet", header.Priority],
    ["Gjeldende steg-id", header.CurrentOrderStepId ?? ""],

    ["På vent (årsak)", header.HoldReason ?? ""],
    ["På vent (kommentar)", header.HoldComment ?? ""],
    ["På vent (steg)", header.HoldAtOrderStepId ?? ""],
    ["På vent (tid)", fmtDate(header.HoldAtUtc)],
    ["På vent (bruker)", header.HoldByUserId ?? ""],

    ["Stoppet (årsak)", header.ClosedReason ?? ""],
    ["Stoppet (kommentar)", header.ClosedComment ?? ""],
    ["Stoppet (steg)", header.ClosedAtOrderStepId ?? ""],
    ["Stoppet (tid)", fmtDate(header.ClosedAtUtc)],
    ["Stoppet (bruker)", header.ClosedByUserId ?? ""],

    ["Opprettet", fmtDate(header.CreatedAt)],
    ["Opprettet av", header.CreatedByUserId ?? ""],
    ["Sist oppdatert", fmtDate(header.UpdatedAt)],
  ];

  grid.innerHTML = fields
    .map(([k, v]) => `
      <div style="border:1px solid #e5e7eb; border-radius:8px; padding:10px;">
        <div style="font-size:12px; color:#6b7280;">${escapeHtml(k)}</div>
        <div style="font-weight:700;">${escapeHtml(v ?? "")}</div>
      </div>
    `)
    .join("");
}

function renderSteps(steps) {
  const body = document.getElementById("stepsBody");
  if (!body) return;

  body.innerHTML = (steps || []).map(s => `
    <tr>
      <td>${escapeHtml(s.Sequence)}</td>
      <td>${escapeHtml(s.StepName)}</td>
      <td>${statusBadge(s.StepStatus)}</td>
      <td>${escapeHtml(s.AssignedToUserId ?? "")}</td>
      <td>${fmtDate(s.StartedAt)}</td>
      <td>${fmtDate(s.CompletedAt)}</td>
      <td>${escapeHtml(s.CompletionDisposition ?? "")}</td>
      <td>${escapeHtml(s.Notes ?? "")}</td>
    </tr>
  `).join("");
}

function renderEvents(events, steps) {
  const stepNameByOrderStepId = new Map();
  for (const s of (steps || [])) stepNameByOrderStepId.set(s.OrderStepId, s.StepName);

  const body = document.getElementById("eventsBody");
  if (!body) return;

  body.innerHTML = (events || []).map(e => `
    <tr>
      <td>${fmtDate(e.CreatedAt)}</td>
      <td>${escapeHtml(e.EventType)}</td>
      <td>${escapeHtml(stepNameByOrderStepId.get(e.OrderStepId) ?? "")}</td>
      <td>${escapeHtml(e.ReasonCode ?? "")}</td>
      <td>${escapeHtml(e.Comment ?? "")}</td>
      <td>${escapeHtml(e.CreatedByUserId ?? "")}</td>
    </tr>
  `).join("");
}

function workNoteStorageKey(orderHeader) {
  // stabil nøkkel per ordre. ExternalAmid er fin.
  const amid = orderHeader?.ExternalAmid || "unknown";
  return `wf_worknote_${amid}`;
}

function setWorkNoteMsg(text, isError = false) {
  const el = document.getElementById("workNoteMsg");
  if (!el) return;
  el.textContent = text || "";
  el.style.color = isError ? "#b91c1c" : "#6b7280";
}

function getWorkNotePayloadFromUi() {
  return {
    note: document.getElementById("workNoteText")?.value ?? "",
    contact: document.getElementById("workNoteContact")?.value ?? "",
    phone: document.getElementById("workNotePhone")?.value ?? "",
    checklist: {
      dokumentasjon: !!document.getElementById("chk1")?.checked,
      metadata: !!document.getElementById("chk2")?.checked,
      vedlegg: !!document.getElementById("chk3")?.checked,
      fagansvarlig: !!document.getElementById("chk4")?.checked,
      klarNeste: !!document.getElementById("chk5")?.checked,
      avvik: !!document.getElementById("chk6")?.checked,
    },
    updatedAt: new Date().toISOString(),
  };
}

function applyWorkNotePayloadToUi(payload) {
  document.getElementById("workNoteText").value = payload?.note ?? "";
  document.getElementById("workNoteContact").value = payload?.contact ?? "";
  document.getElementById("workNotePhone").value = payload?.phone ?? "";

  const c = payload?.checklist || {};
  document.getElementById("chk1").checked = !!c.dokumentasjon;
  document.getElementById("chk2").checked = !!c.metadata;
  document.getElementById("chk3").checked = !!c.vedlegg;
  document.getElementById("chk4").checked = !!c.fagansvarlig;
  document.getElementById("chk5").checked = !!c.klarNeste;
  document.getElementById("chk6").checked = !!c.avvik;
}

function showWorkNoteCard(show) {
  const card = document.getElementById("workNoteCard");
  if (card) card.style.display = show ? "block" : "none";
}

function loadWorkNoteFromStorage(orderHeader) {
  try {
    const key = workNoteStorageKey(orderHeader);
    const raw = localStorage.getItem(key);
    if (!raw) {
      applyWorkNotePayloadToUi(null);
      setWorkNoteMsg("Ingen lagret notat for denne ordren enda.");
      return;
    }
    const payload = JSON.parse(raw);
    applyWorkNotePayloadToUi(payload);
    setWorkNoteMsg(payload?.updatedAt ? `Sist lagret: ${fmtDate(payload.updatedAt)}` : "Lastet.");
  } catch (e) {
    setWorkNoteMsg("Kunne ikke laste notat (ugyldig data i lokal lagring).", true);
  }
}

function saveWorkNoteToStorage(orderHeader) {
  try {
    const key = workNoteStorageKey(orderHeader);
    const payload = getWorkNotePayloadFromUi();
    localStorage.setItem(key, JSON.stringify(payload));
    setWorkNoteMsg(`Lagret lokalt: ${fmtDate(payload.updatedAt)}`);
  } catch (e) {
    setWorkNoteMsg("Kunne ikke lagre notat lokalt.", true);
  }
}

function clearWorkNoteStorage(orderHeader) {
  try {
    const key = workNoteStorageKey(orderHeader);
    localStorage.removeItem(key);
    applyWorkNotePayloadToUi(null);
    setWorkNoteMsg("Tømt.");
  } catch {
    setWorkNoteMsg("Kunne ikke tømme.", true);
  }
}

async function loadOrder() {
  const amidEl = document.getElementById("amidInput");
  const amid = amidEl?.value?.trim();
  if (!amid) {
    setMsg("Skriv inn _amid for å hente ordre.", true);
    return null;
  }

  setMsg("Henter…");
  const data = await apiGet(`/api/wf/orders/by-amid/${encodeURIComponent(amid)}`);

lastOrder = data;

showWorkNoteCard(true);
loadWorkNoteFromStorage(data.header);

renderHeader(data.header);
renderSteps(data.steps);
renderEvents(data.events, data.steps);

  setMsg("OK");
  return data;
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadNavbar();

  // ✅ Make dropdown work even before /me loads
  initUserMenu(null);

  // ✅ Populate username + admin item if logged in
  if (ensureLoggedIn()) {
    await initMeForMenu();
  }

document.getElementById("workNoteSaveBtn")?.addEventListener("click", () => {
  if (!lastOrder?.header) return;
  saveWorkNoteToStorage(lastOrder.header);
});

document.getElementById("workNoteClearBtn")?.addEventListener("click", () => {
  if (!lastOrder?.header) return;
  clearWorkNoteStorage(lastOrder.header);
});

  const loadBtn = document.getElementById("loadBtn");
  loadBtn?.addEventListener("click", async () => {
    if (!ensureLoggedIn()) return;
    try {
      await loadOrder();
    } catch (e) {
      setMsg(e.message || "Feil ved henting.", true);
    }
  });

  // Auto-load if amid is provided in querystring (?amid=...)
  const amidFromQs = new URLSearchParams(window.location.search).get("amid");
  if (amidFromQs) {
    const amidInput = document.getElementById("amidInput");
    if (amidInput) amidInput.value = amidFromQs;

    if (ensureLoggedIn()) {
      try { await loadOrder(); } catch (e) { /* message already handled */ }
    }
  }
});