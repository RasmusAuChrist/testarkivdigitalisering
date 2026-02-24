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

let me = null;
let rawItems = [];

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
  if (!el) return;
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
    status === "OnHold" ? "#b91c1c" :
    status === "Stopped" ? "#111827" :
    status === "Completed" ? "#2563eb" :
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

/* ---------------------------
   Rule-based "Stegstatus"
   --------------------------- */
function computeDisplayStatus(it) {
  // 1) Order-level hold overrides everything
  if (it.OrderStatus === "OnHold") return "OnHold";

  // 2) Order-level closure => stopped
  if (it.OrderStatus === "Closed" || it.OrderStatus === "Completed") return "Stopped";

  // 3) Step-level stop (if included in queue)
  if (it.StepStatus === "Stopped") return "Stopped";

  // 4) Blocked is explicit
  if (it.StepStatus === "Blocked") return "Blocked";

  // 5) Assigned => Active (your preferred rule)
  if (it.AssignedToUserId != null) return "Active";

  // 6) Default
  return "Pending";
}

/* ---------- Filtering ---------- */
function readFilterState() {
  const chkShowStopped = document.getElementById("chkShowStopped");
  const chkShowPaused = document.getElementById("chkShowPaused");
  return { showStopped: !!chkShowStopped?.checked, showPaused: !!chkShowPaused?.checked };
}

function isPausedOrder(it) {
  return it.OrderStatus === "OnHold";
}

function isStoppedOrder(it) {
  return (it.OrderStatus === "Closed" || it.OrderStatus === "Completed" || it.StepStatus === "Stopped");
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
  if (chkShowPaused) chkShowPaused.checked = (sPaused === null ? true : sPaused === "1");
}

/* ---------- Rendering ---------- */
function canClaimRow(it) {
  if (!me) return false;

  // Claim should follow real step status (server enforces anyway)
  if (!["Pending", "Active", "Blocked"].includes(it.StepStatus)) return false;

  // If assigned to another user, don't allow
  if (it.AssignedToUserId && it.AssignedToUserId !== me.user_id) return false;

  // If order is OnHold/Closed/Completed, claim will fail; disable here too
  if (it.OrderStatus !== "Open") return false;

  return true;
}

function controlsCell(it) {
  const orderId = it.OrderId;
  const orderStepId = it.OrderStepId;

  const claimDisabled = !canClaimRow(it);
  const claimText = (it.AssignedToUserId ? "Tatt" : "Ta");

  const unclaimDisabled = !(
    it.OrderStatus === "Open" &&
    it.AssignedToUserId &&
    me &&
    it.AssignedToUserId === me.user_id &&
    !["Completed", "Stopped"].includes(it.StepStatus)
  );

  const completeDisabled = !(it.OrderStatus === "Open") || ["Completed", "Stopped"].includes(it.StepStatus);

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
  if (countBox) countBox.textContent = `Antall: ${items.length} / ${itemsAll.length}`;

  if (!tbody) return;

  tbody.innerHTML = items.map(it => {
    const dispStatus = computeDisplayStatus(it);

    return `
      <tr>
        <td>${statusBadge(dispStatus)}</td>
        <td>${escapeHtml(it.BatchNo ?? "")}</td>
        <td>
          <div style="display:flex; flex-direction:column; gap:2px;">
            <div style="font-weight:700;">${escapeHtml(it.Title ?? "")}</div>
            <div style="font-size:12px; color:#6b7280;">
              OrdreId: ${escapeHtml(it.OrderId)} · Steg: ${escapeHtml(it.Sequence)} · _amid: <code>${escapeHtml(it.ExternalAmid)}</code>
            </div>
          </div>
        </td>
        <td>${escapeHtml(it.AssignedToUserId ?? "")}</td>
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

/* ---------- Delegated controls ---------- */
function wireDelegatedControls() {
  const tbody = document.getElementById("tbody");
  if (!tbody) return;

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
  if (!select) return;

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

  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    clearToken();
    window.location.assign("/views/login.html");
  });

  initStepSelect();
  restoreFilters();
  wireFilterCheckboxes();
  wireDelegatedControls();

  document.getElementById("refreshBtn")?.addEventListener("click", async () => {
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