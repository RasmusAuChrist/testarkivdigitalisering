import { getToken, clearToken } from "./auth.js";

const API_BASE = "https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net";

// Hardcoded step list (matches your seeded WfStepDefinition order)
const steps = [
  { id: 1, name: "Analyse" },
  { id: 2, name: "Prioriteringsråd" },
  { id: 3, name: "Arkivkartlegging" },
  { id: 4, name: "Fysisk klargjøring" },
  { id: 5, name: "Klar til sending" },
  { id: 6, name: "Lager NHA" },
  { id: 7, name: "Skanning pågår" },
  { id: 8, name: "Etterarbeid skanning" },
  { id: 9, name: "Skape uttrekk" },
  { id: 10, name: "Kvalitetskontroll" },
  { id: 11, name: "Opplasting og innlemming" },
  { id: 12, name: "Metadata etterarbeid" },
  { id: 13, name: "Opprydning for destruksjon - gjelder både fysisk og digitalt" },
  { id: 14, name: "Opprydning for videresending" },
];

let me = null;        // { user_id, username, roles, . }
let rawItems = [];    // last queue fetch (unfiltered)

const LS_SHOW_STOPPED = "wfq_show_stopped";
const LS_SHOW_PAUSED = "wfq_show_paused";

function ensureLoggedIn() {
  const token = getToken();
  if (!token) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.assign(`/views/login.html?next=${next}`);
    return false;
  }
  return true;
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function setMsg(text, isError = false) {
  const el = document.getElementById("msg");
  el.textContent = text || "";
  el.style.color = isError ? "#ffb4b4" : "#ffffff";
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
    status === "Blocked" ? "#b91c1c" :
    status === "Completed" ? "#2563eb" :
    status === "Stopped" ? "#111827" :
    "#374151";
  return `<span style="display:inline-flex; padding:2px 8px; border-radius:999px; background:${color}; color:#fff; font-weight:700; font-size:12px;">${escapeHtml(status)}</span>`;
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

/* ---------- Filtering ---------- */

function readFilterState() {
  const chkShowStopped = document.getElementById("chkShowStopped");
  const chkShowPaused = document.getElementById("chkShowPaused");

  const showStopped = !!chkShowStopped?.checked;
  const showPaused = !!chkShowPaused?.checked;

  return { showStopped, showPaused };
}

// “Paused” detection supports future queue SP improvements.
// Today it may only work if your queue endpoint includes any of these fields.
function isPausedOrder(it) {
  const orderStatus = it.OrderStatus ?? it.Status ?? null; // some SPs call it Status
  if (orderStatus === "OnHold") return true;

  if (it.IsOnHold === true) return true;

  // If these exist and are populated, treat as paused
  if (it.HoldAtUtc) return true;
  if (it.HoldReason) return true;

  return false;
}

function isStoppedOrder(it) {
  const orderStatus = it.OrderStatus ?? it.Status ?? null;
  if (orderStatus === "Closed" || orderStatus === "Completed") return true;

  // We definitely have StepStatus in the queue rows (you render it today)
  if (it.StepStatus === "Stopped") return true;

  return false;
}

function applyFilters(items) {
  const { showStopped, showPaused } = readFilterState();

  return (items || []).filter(it => {
    if (!showStopped && isStoppedOrder(it)) return false;
    if (!showPaused && isPausedOrder(it)) return false;
    return true;
  });
}

function persistFilters() {
  const { showStopped, showPaused } = readFilterState();
  localStorage.setItem(LS_SHOW_STOPPED, showStopped ? "1" : "0");
  localStorage.setItem(LS_SHOW_PAUSED, showPaused ? "1" : "0");
}

function restoreFilters() {
  const chkShowStopped = document.getElementById("chkShowStopped");
  const chkShowPaused = document.getElementById("chkShowPaused");

  const sStopped = localStorage.getItem(LS_SHOW_STOPPED);
  const sPaused = localStorage.getItem(LS_SHOW_PAUSED);

  if (chkShowStopped) chkShowStopped.checked = (sStopped === "1");
  // default: show paused = true
  if (chkShowPaused) chkShowPaused.checked = (sPaused === null ? true : sPaused === "1");
}

/* ---------- Rendering ---------- */

function canClaimRow(it) {
  if (!me) return false;

  const assignedTo = it.AssignedToUserId;
  const stepStatus = it.StepStatus;

  if (!["Pending", "Active", "Blocked"].includes(stepStatus)) return false;
  if (assignedTo && assignedTo !== me.user_id) return false;

  return true;
}

function controlsCell(it) {
  const orderId = it.OrderId;
  const orderStepId = it.OrderStepId;

  const claimDisabled = !canClaimRow(it);
  const claimText = (it.AssignedToUserId ? "Tatt" : "Ta");
  const unclaimDisabled = !(it.AssignedToUserId && me && it.AssignedToUserId === me.user_id && !["Completed", "Stopped"].includes(it.StepStatus));

  const statusOptions = ["Pending", "Active", "Blocked", "Completed"]
    .map(s => `<option value="${s}" ${s === it.StepStatus ? "selected" : ""}>${s}</option>`)
    .join("");

  const completeDisabled = ["Completed", "Stopped"].includes(it.StepStatus);

  return `
    <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
      <button class="btn btn-primary"
              data-action="claim"
              data-order-step-id="${orderStepId}"
              ${claimDisabled ? "disabled" : ""}>
        <span class="btn-text">${claimText}</span>
      </button>

      <button class="btn btn-outline"
              data-action="unclaim"
              data-order-step-id="${orderStepId}"
              ${unclaimDisabled ? "disabled" : ""}>
        <span class="btn-text">Frigi</span>
      </button>

      <select data-action="set-status"
              data-order-step-id="${orderStepId}"
              style="padding:8px; border:1px solid #e5e7eb; border-radius:8px;">
        ${statusOptions}
      </select>

      <button class="btn btn-outline"
              data-action="complete"
              data-order-step-id="${orderStepId}"
              ${completeDisabled ? "disabled" : ""}>
        <span class="btn-text">Fullfør</span>
      </button>

      <button class="btn btn-outline"
              data-action="hold"
              data-order-id="${orderId}">
        <span class="btn-text">Vent</span>
      </button>

      <button class="btn btn-outline"
              data-action="unhold"
              data-order-id="${orderId}">
        <span class="btn-text">Av vent</span>
      </button>

      <button class="btn btn-outline"
              data-action="close"
              data-order-id="${orderId}"
              style="border-color:#ef4444; color:#ef4444;">
        <span class="btn-text">Stopp</span>
      </button>
    </div>
  `;
}

function render(itemsAll) {
  const items = applyFilters(itemsAll);

  const tbody = document.getElementById("tbody");
  const countBox = document.getElementById("countBox");
  countBox.textContent = `Antall: ${items.length} / ${itemsAll.length}`;

  tbody.innerHTML = items.map(it => {
    return `
      <tr>
        <td>${escapeHtml(it.Priority)}</td>
        <td>${escapeHtml(it.OrderId)}</td>
        <td>${escapeHtml(it.BatchNo ?? "")}</td>
        <td>${escapeHtml(it.Title ?? "")}</td>
        <td>${statusBadge(it.StepStatus)}</td>
        <td>${escapeHtml(it.AssignedToUserId ?? "")}</td>
        <td>${fmtDate(it.StartedAt)}</td>
        <td><code>${escapeHtml(it.ExternalAmid)}</code></td>
        <td>
          <a class="btn btn-outline" href="/views/workflow_order.html?amid=${encodeURIComponent(it.ExternalAmid)}">
            Åpne
          </a>
        </td>
        <td>${controlsCell(it)}</td>
      </tr>
    `;
  }).join("");
}

/**
 * Single delegated handler for all buttons/selects in the table
 */
function wireDelegatedControls() {
  const tbody = document.getElementById("tbody");

  tbody.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("button[data-action]");
    if (!btn) return;

    if (!ensureLoggedIn()) return;

    const action = btn.getAttribute("data-action");

    try {
      btn.disabled = true;

      if (action === "claim") {
        const orderStepId = Number(btn.getAttribute("data-order-step-id"));
        setMsg("Tar oppgave…");
        await apiPost(`/api/wf/steps/${orderStepId}/claim`, {});
        setMsg("Oppgave tatt.");
      }

      if (action === "unclaim") {
        const orderStepId = Number(btn.getAttribute("data-order-step-id"));
        const comment = window.prompt("Kommentar (valgfritt):", "") ?? "";
        setMsg("Frigir…");
        await apiPost(`/api/wf/steps/${orderStepId}/unclaim`, { comment: comment.trim() || null });
        setMsg("Frigitt.");
      }

      if (action === "complete") {
        const orderStepId = Number(btn.getAttribute("data-order-step-id"));
        const disposition = (window.prompt("Disposition (påkrevd):", "OK") ?? "").trim();
        if (!disposition) throw new Error("Disposition er påkrevd.");
        const notes = window.prompt("Merknad (valgfritt):", "") ?? "";
        setMsg("Fullfører…");
        await apiPost(`/api/wf/steps/${orderStepId}/complete`, {
          disposition,
          notes: notes.trim() || null,
        });
        setMsg("Steg fullført.");
      }

      if (action === "hold") {
        const orderId = Number(btn.getAttribute("data-order-id"));
        const reason = (window.prompt("På vent – årsak (påkrevd):", "WAIT") ?? "").trim();
        if (!reason) throw new Error("Årsak er påkrevd.");
        const comment = window.prompt("Kommentar (valgfritt):", "") ?? "";
        setMsg("Setter på vent…");
        await apiPost(`/api/wf/orders/${orderId}/hold`, { reason, comment: comment.trim() || null });
        setMsg("Ordre satt på vent.");
      }

      if (action === "unhold") {
        const orderId = Number(btn.getAttribute("data-order-id"));
        const comment = window.prompt("Kommentar (valgfritt):", "") ?? "";
        setMsg("Tar av vent…");
        await apiPost(`/api/wf/orders/${orderId}/unhold`, { comment: comment.trim() || null });
        setMsg("Ordre tatt av vent.");
      }

      if (action === "close") {
        const orderId = Number(btn.getAttribute("data-order-id"));
        const ok = window.confirm("Er du sikker på at du vil stoppe ordren?");
        if (!ok) return;

        const reason = (window.prompt("Stopp – årsak (påkrevd):", "STOPPED") ?? "").trim();
        if (!reason) throw new Error("Årsak er påkrevd.");
        const comment = window.prompt("Kommentar (valgfritt):", "") ?? "";
        setMsg("Stopper ordre…");
        await apiPost(`/api/wf/orders/${orderId}/close`, { reason, comment: comment.trim() || null });
        setMsg("Ordre stoppet.");
      }

      await refresh();
    } catch (e) {
      setMsg(e.message || "Feil ved handling.", true);
    } finally {
      btn.disabled = false;
    }
  });

  tbody.addEventListener("change", async (ev) => {
    const sel = ev.target.closest('select[data-action="set-status"]');
    if (!sel) return;

    if (!ensureLoggedIn()) return;

    const orderStepId = Number(sel.getAttribute("data-order-step-id"));
    const status = sel.value;

    try {
      const reason_code = (window.prompt("Årsakskode (valgfritt):", "") ?? "").trim() || null;
      const comment = (window.prompt("Kommentar (valgfritt):", "") ?? "").trim() || null;

      setMsg("Oppdaterer status…");
      await apiPost(`/api/wf/steps/${orderStepId}/set-status`, { status, reason_code, comment });
      setMsg("Status oppdatert.");
      await refresh();
    } catch (e) {
      setMsg(e.message || "Feil ved statusendring.", true);
      await refresh().catch(() => {});
    }
  });
}

/* ---------- Refresh ---------- */

async function refresh() {
  const stepDefId = Number(document.getElementById("stepSelect").value);
  setMsg("Henter kø…");

  const data = await apiGet(`/api/wf/steps/${stepDefId}/queue`);
  rawItems = data.items || [];

  render(rawItems);
  setMsg("OK");
}

function initStepSelect() {
  const select = document.getElementById("stepSelect");
  select.innerHTML = steps.map(s => `<option value="${s.id}">${s.id}. ${escapeHtml(s.name)}</option>`).join("");

  const stepFromQs = new URLSearchParams(window.location.search).get("step");
  if (stepFromQs && steps.some(s => String(s.id) === stepFromQs)) {
    select.value = stepFromQs;
  }
}

async function initMe() {
  me = await apiGet("/api/auth/me");
}

function wireFilterCheckboxes() {
  const chkShowStopped = document.getElementById("chkShowStopped");
  const chkShowPaused = document.getElementById("chkShowPaused");

  const onChange = () => {
    persistFilters();
    render(rawItems);
  };

  chkShowStopped?.addEventListener("change", onChange);
  chkShowPaused?.addEventListener("change", onChange);
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadNavbar();

  document.getElementById("logoutBtn").addEventListener("click", () => {
    clearToken();
    window.location.assign("/views/login.html");
  });

  initStepSelect();
  restoreFilters();
  wireFilterCheckboxes();
  wireDelegatedControls();

  document.getElementById("refreshBtn").addEventListener("click", async () => {
    if (!ensureLoggedIn()) return;
    try {
      if (!me) await initMe();
      await refresh();
    } catch (e) {
      setMsg(e.message || "Feil ved henting.", true);
    }
  });

  if (ensureLoggedIn()) {
    try {
      await initMe();
      await refresh();
    } catch (e) {
      setMsg(e.message || "Feil ved henting.", true);
    }
  }
});