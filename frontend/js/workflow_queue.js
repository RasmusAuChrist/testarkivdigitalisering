import { getToken, clearToken } from "./auth.js";
import { initUserMenu } from "./user_menu.js";

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

const ASTA_GUI_BASE = "https://av.stiftelsen-asta.no/gui/";

function buildAstaSeriesUrl(item) {
  const amid = item?.ExternalAmid;
  if (!amid) return "#";

  const historyLabel = item?.Identifikator
    ? `${item.Identifikator} - ${item.Title ?? ""}`.trim()
    : (item?.Title ?? "Åpne i ASTA");

  const payload = {
    c: "c",
    h: historyLabel,
    cid: amid,
    aid: "isadg",
    enm: "SERIE"
  };

  const params = new URLSearchParams({
    userHistoryLoaded: "true",
    ta: "1",
    t_1: JSON.stringify(payload)
  });

  return `${ASTA_GUI_BASE}?${params.toString()}`;
}

function astaButton(item) {
  const amid = item?.ExternalAmid;
  if (!amid) return "";

  return `
    <div style="margin-top:8px;">
      <a
        class="btn btn-outline"
        href="${buildAstaSeriesUrl(item)}"
        target="_blank"
        rel="noopener noreferrer"
        title="Åpne i baseinformasjonssystemet"
        style="padding:6px 10px; font-size:12px;"
      >
        Åpne i ASTA
      </a>
    </div>
  `;
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

function stringToColor(str) {
  let hash = 0;

  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Generate HSL color (nice consistent palette)
  const hue = hash % 360;
  return `hsl(${hue}, 65%, 45%)`;
}

function userPill(username) {
  if (!username) return "";

  const bg = stringToColor(username);

  return `
    <span style="
      display:inline-flex;
      align-items:center;
      padding:4px 10px;
      border-radius:999px;
      font-size:12px;
      font-weight:600;
      background:${bg};
      color:#fff;
      white-space:nowrap;
    ">
      ${escapeHtml(username)}
    </span>
  `;
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

function sumHyllemeter(items) {
  return (items || []).reduce((sum, it) => {
    const value = it?.Hyllemeter;

    if (value == null || value === "") return sum;

    const num = typeof value === "number"
      ? value
      : Number(String(value).replace(",", "."));

    return Number.isFinite(num) ? sum + num : sum;
  }, 0);
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
function isOrderOpenish(it) {
  return it.OrderStatus === "Open" || it.OrderStatus === "OnHold";
}

function isOrderOpen(it) {
  return isOrderOpenish(it);
}

function isOrderOnHold(it) {
  return it.OrderStatus === "OnHold";
}

function isOrderOpenOnly(it) {
  return it.OrderStatus === "Open";
}

function isOrderClosedLike(it) {
  return it.OrderStatus === "Closed" || it.OrderStatus === "Completed";
}

function isStepFinished(it) {
  return it.StepStatus === "Completed" || it.StepStatus === "Stopped";
}

function isStepClaimableByStatus(it) {
  return ["Pending", "Active", "Blocked"].includes(it.StepStatus);
}

function isTaken(it) {
  return it.AssignedToUserId != null;
}

function isTakenByMe(it) {
  return me && it.AssignedToUserId === me.user_id;
}

/** "Ta" allowed: order open, step claimable, and not taken */
function canShowClaim(it) {
  return !!me && isOrderOpenish(it) && isStepClaimableByStatus(it) && !isTaken(it);
}

/** "Frigi" allowed: order open, step not finished, and taken by me */
function canShowUnclaim(it) {
  return !!me && isOrderOpen(it) && !isStepFinished(it) && isTakenByMe(it);
}

/** "Fullfør" allowed: order open, step not finished, and either taken by me OR not taken (your choice) */
function canShowComplete(it) {
  if (!me) return false;
  if (!isOrderOpen(it)) return false;
  if (isStepFinished(it)) return false;
  if (!isStepClaimableByStatus(it)) return false;

  // if you want to require "taken by me", keep only isTakenByMe(it)
  return isTakenByMe(it);
}

function canShowHold(it) {
  return isOrderOpenOnly(it);
}

function canShowUnhold(it) {
  return isOrderOnHold(it);
}

function canShowClose(it) {
  return !isOrderClosedLike(it); // allow close from Open or OnHold
};

function controlsCell(it) {
  const orderId = it.OrderId;
  const orderStepId = it.OrderStepId;

  const parts = [];

  // Ta
  if (canShowClaim(it)) {
    parts.push(`
      <button class="btn btn-primary"
              data-action="claim"
              data-order-step-id="${orderStepId}">
        <span class="btn-text">Ta</span>
      </button>
    `);
  }

  // Frigi
  if (canShowUnclaim(it)) {
    parts.push(`
      <button class="btn btn-outline"
              data-action="unclaim"
              data-order-step-id="${orderStepId}">
        <span class="btn-text">Frigi</span>
      </button>
    `);
  }

  // Fullfør
  if (canShowComplete(it)) {
    parts.push(`
      <button class="btn btn-outline"
              data-action="complete"
              data-order-step-id="${orderStepId}">
        <span class="btn-text">Fullfør</span>
      </button>
    `);
  }

  // Vent / Av vent
  if (canShowHold(it)) {
    parts.push(`
      <button class="btn btn-outline"
              data-action="hold"
              data-order-id="${orderId}">
        <span class="btn-text">Vent</span>
      </button>
    `);
  }

  if (canShowUnhold(it)) {
    parts.push(`
      <button class="btn btn-outline"
              data-action="unhold"
              data-order-id="${orderId}">
        <span class="btn-text">Av vent</span>
      </button>
    `);
  }

  // Stopp
  if (canShowClose(it)) {
    parts.push(`
      <button class="btn btn-outline"
              data-action="close"
              data-order-id="${orderId}"
              style="border-color:#ef4444; color:#ef4444;">
        <span class="btn-text">Stopp</span>
      </button>
    `);
  }

  // If nothing is available, show a small dash
  if (parts.length === 0) {
    return `<span style="color:#6b7280;">–</span>`;
  }

  return `<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">${parts.join("")}</div>`;
}

function render(itemsAll) {
  const items = applyFilters(itemsAll);

  const tbody = document.getElementById("tbody");
  const countBox = document.getElementById("countBox");
  if (countBox) {
    const totalHyllemeter = sumHyllemeter(items);

    countBox.textContent =
      `Antall: ${items.length} / ${itemsAll.length}\n` +
      `Bekreftet hyllemeter: ${totalHyllemeter.toLocaleString("no-NO")}`;
  }
  if (!tbody) return;

  tbody.innerHTML = items.map(it => {
    const dispStatus = computeDisplayStatus(it);

    return `
      <tr>
        <td style="vertical-align:top;">${statusBadge(dispStatus)}</td>

        <td style="vertical-align:top;">
          <div style="display:flex; flex-direction:column; gap:4px; min-width:0;">
            <div style="font-weight:700; overflow-wrap:anywhere; word-break:break-word;">
              ${escapeHtml(it.Title ?? "")}
            </div>

            <div style="font-size:12px; color:#6b7280; overflow-wrap:anywhere; word-break:break-word;">
              <strong>Identifikator:</strong> ${escapeHtml(it.Identifikator ?? "")}
            </div>

            <div style="font-size:12px; color:#6b7280; overflow-wrap:anywhere; word-break:break-word;">
              <strong>Hyllemeter:</strong> ${it.Hyllemeter == null ? "Ikke registrert" : escapeHtml(it.Hyllemeter)}
            </div>

            <div style="font-size:12px; color:#6b7280; overflow-wrap:anywhere; word-break:break-word; white-space:normal;">
              <strong>Restriksjoner:</strong> ${escapeHtml(it.Restriksjoner ?? "")}
            </div>

            ${astaButton(it)}
          </div>
        </td>

        <td style="vertical-align:top;">${userPill(it.AssignedToUserName)}</td>

        <td style="vertical-align:top;">
          <a class="btn btn-outline" href="/views/workflow_order.html?amid=${encodeURIComponent(it.ExternalAmid)}">
            Åpne
          </a>
        </td>

        <td style="vertical-align:top;">${controlsCell(it)}</td>
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
      initUserMenu(me);
      await refresh();
    } catch (e) {
      setMsg(e.message || "Feil ved henting.", true);
    }
  }
});