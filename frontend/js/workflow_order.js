import { getToken, clearToken } from "./auth.js";

const API_BASE = "https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net";

let lastOrder = null; // { header, steps, events }

function setMsg(text, isError = false) {
  const el = document.getElementById("msg");
  el.textContent = text || "";
  el.style.color = isError ? "#ffb4b4" : "#ffffff";
}

function setActionMsg(text, isError = false) {
  const el = document.getElementById("actionMsg");
  if (!el) return;
  el.textContent = text || "";
  el.style.color = isError ? "#b91c1c" : "#111827";
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
    "#374151";

  return `<span style="display:inline-flex; padding:2px 8px; border-radius:999px; background:${color}; color:#fff; font-weight:700; font-size:12px;">${escapeHtml(status)}</span>`;
}

function renderHeader(header) {
  const card = document.getElementById("headerCard");
  const grid = document.getElementById("headerGrid");

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
    ["På vent (tid)", fmtDate(header.HoldAtUtc)],
    ["Stoppet (årsak)", header.ClosedReason ?? ""],
    ["Stoppet (tid)", fmtDate(header.ClosedAtUtc)],
    ["Opprettet", fmtDate(header.CreatedAt)],
  ];

  grid.innerHTML = fields
    .map(([k, v]) => {
      return `
        <div style="border:1px solid #e5e7eb; border-radius:8px; padding:10px;">
          <div style="font-size:12px; color:#6b7280;">${k}</div>
          <div style="font-weight:700;">${escapeHtml(v ?? "")}</div>
        </div>
      `;
    })
    .join("");
}

function renderSteps(steps) {
  const body = document.getElementById("stepsBody");
  body.innerHTML = steps.map(s => `
    <tr>
      <td>${s.Sequence}</td>
      <td>${escapeHtml(s.StepName)}</td>
      <td>${statusBadge(s.StepStatus)}</td>
      <td>${s.AssignedToUserId ?? ""}</td>
      <td>${fmtDate(s.StartedAt)}</td>
      <td>${fmtDate(s.CompletedAt)}</td>
      <td>${escapeHtml(s.CompletionDisposition ?? "")}</td>
      <td>${escapeHtml(s.Notes ?? "")}</td>
    </tr>
  `).join("");
}

function renderEvents(events, steps) {
  const stepNameByOrderStepId = new Map();
  for (const s of steps) stepNameByOrderStepId.set(s.OrderStepId, s.StepName);

  const body = document.getElementById("eventsBody");
  body.innerHTML = events.map(e => `
    <tr>
      <td>${fmtDate(e.CreatedAt)}</td>
      <td>${escapeHtml(e.EventType)}</td>
      <td>${escapeHtml(stepNameByOrderStepId.get(e.OrderStepId) ?? "")}</td>
      <td>${escapeHtml(e.ReasonCode ?? "")}</td>
      <td>${escapeHtml(e.Comment ?? "")}</td>
      <td>${e.CreatedByUserId ?? ""}</td>
    </tr>
  `).join("");
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

function renderActions(header, steps) {
  const actionsCard = document.getElementById("actionsCard");
  actionsCard.style.display = "block";

  const stepPick = document.getElementById("stepPick");
  const currentId = header.CurrentOrderStepId;

  stepPick.innerHTML = steps
    .map(s => {
      const label = `${s.OrderStepId} — ${s.Sequence}. ${s.StepName} (${s.StepStatus})`;
      const sel = String(s.OrderStepId) === String(currentId) ? "selected" : "";
      return `<option value="${escapeHtml(s.OrderStepId)}" ${sel}>${escapeHtml(label)}</option>`;
    })
    .join("");

  // Prefill status dropdown to match selected step
  const statusSel = document.getElementById("stepStatus");
  const selected = steps.find(x => String(x.OrderStepId) === String(stepPick.value)) || steps.find(x => String(x.OrderStepId) === String(currentId));
  if (selected) statusSel.value = selected.StepStatus;

  stepPick.addEventListener("change", () => {
    const s = steps.find(x => String(x.OrderStepId) === String(stepPick.value));
    if (s) {
      statusSel.value = s.StepStatus;
      setActionMsg("");
    }
  });
}

async function loadOrder() {
  const amid = document.getElementById("amidInput").value.trim();
  if (!amid) {
    setMsg("Skriv inn _amid for å hente ordre.", true);
    return null;
  }

  setMsg("Henter…");
  const data = await apiGet(`/api/wf/orders/by-amid/${encodeURIComponent(amid)}`);

  lastOrder = data;

  renderHeader(data.header);
  renderSteps(data.steps);
  renderEvents(data.events, data.steps);
  renderActions(data.header, data.steps);

  setMsg("OK");
  return data;
}

// --------------------
// Action handlers
// --------------------
function getSelectedOrderStepId() {
  const el = document.getElementById("stepPick");
  const id = Number(el?.value);
  if (!id) throw new Error("Velg et steg først.");
  return id;
}

function getOrderId() {
  const id = Number(lastOrder?.header?.OrderId);
  if (!id) throw new Error("Mangler OrderId. Hent ordre først.");
  return id;
}

async function doAndReload(fn) {
  setActionMsg("Utfører…");
  await fn();
  await loadOrder();
  setActionMsg("Utført ✔️");
}

function wireActions() {
  // Step status
  document.getElementById("btnSetStatus").addEventListener("click", async () => {
    if (!ensureLoggedIn()) return;
    try {
      const orderStepId = getSelectedOrderStepId();
      const status = document.getElementById("stepStatus").value;
      const reason_code = document.getElementById("reasonCode").value.trim() || null;
      const comment = document.getElementById("stepComment").value.trim() || null;

      await doAndReload(() => apiPost(`/api/wf/steps/${orderStepId}/set-status`, { status, reason_code, comment }));
    } catch (e) {
      setActionMsg(e.message || "Feil", true);
    }
  });

  // Complete step
  document.getElementById("btnComplete").addEventListener("click", async () => {
    if (!ensureLoggedIn()) return;
    try {
      const orderStepId = getSelectedOrderStepId();
      const disposition = document.getElementById("disposition").value.trim();
      const notes = document.getElementById("completeNotes").value.trim() || null;

      if (!disposition) {
        setActionMsg("Disposition er påkrevd.", true);
        return;
      }

      await doAndReload(() => apiPost(`/api/wf/steps/${orderStepId}/complete`, { disposition, notes }));
    } catch (e) {
      setActionMsg(e.message || "Feil", true);
    }
  });

  // Unclaim
  document.getElementById("btnUnclaim").addEventListener("click", async () => {
    if (!ensureLoggedIn()) return;
    try {
      const orderStepId = getSelectedOrderStepId();
      const comment = document.getElementById("stepComment").value.trim() || null;

      await doAndReload(() => apiPost(`/api/wf/steps/${orderStepId}/unclaim`, { comment }));
    } catch (e) {
      setActionMsg(e.message || "Feil", true);
    }
  });

  // Hold order
  document.getElementById("btnHold").addEventListener("click", async () => {
    if (!ensureLoggedIn()) return;
    try {
      const orderId = getOrderId();
      const reason = document.getElementById("holdReason").value.trim();
      if (!reason) {
        setActionMsg("Skriv årsak for på vent.", true);
        return;
      }

      await doAndReload(() => apiPost(`/api/wf/orders/${orderId}/hold`, { reason }));
    } catch (e) {
      setActionMsg(e.message || "Feil", true);
    }
  });

  // Unhold order
  document.getElementById("btnUnhold").addEventListener("click", async () => {
    if (!ensureLoggedIn()) return;
    try {
      const orderId = getOrderId();
      await doAndReload(() => apiPost(`/api/wf/orders/${orderId}/unhold`, {}));
    } catch (e) {
      setActionMsg(e.message || "Feil", true);
    }
  });

  // Close order
  document.getElementById("btnClose").addEventListener("click", async () => {
    if (!ensureLoggedIn()) return;
    try {
      const orderId = getOrderId();
      const reason = document.getElementById("closeReason").value.trim();
      if (!reason) {
        setActionMsg("Skriv årsak for stopp.", true);
        return;
      }

      const ok = window.confirm("Er du sikker på at du vil stoppe ordren?");
      if (!ok) return;

      await doAndReload(() => apiPost(`/api/wf/orders/${orderId}/close`, { reason }));
    } catch (e) {
      setActionMsg(e.message || "Feil", true);
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadNavbar();

  document.getElementById("logoutBtn").addEventListener("click", () => {
    clearToken();
    window.location.assign("/views/login.html");
  });

  document.getElementById("loadBtn").addEventListener("click", async () => {
    if (!ensureLoggedIn()) return;
    try {
      await loadOrder();
    } catch (e) {
      setMsg(e.message || "Feil ved henting.", true);
    }
  });

  wireActions();

  // Auto-load if amid is provided in querystring (?amid=...)
  const amidFromQs = new URLSearchParams(window.location.search).get("amid");
  if (amidFromQs) {
    document.getElementById("amidInput").value = amidFromQs;
    if (ensureLoggedIn()) {
      try { await loadOrder(); } catch {}
    }
  }
});