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
let assignableUsers = null;

function hasAnyRole(...roles) {
  const mine = new Set(me?.roles || []);
  return roles.some(role => mine.has(role));
}

function canAssignOthers() {
  return hasAnyRole("Admin", "Koordinator");
}

const LS_SHOW_STOPPED = "wfq_show_stopped";
const LS_SHOW_PAUSED = "wfq_show_paused";
const LS_SHOW_MINE_ONLY = "wfq_show_mine_only";

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
  <span
    class="user-pill user-pill--dynamic"
    style="--pill-bg:${bg};"
  >
    ${escapeHtml(username)}
  </span>
`;
}

function actionIcon(name) {
  const common = 'width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"';
  const stroke = 'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';

  const icons = {
    assign: `
      <svg ${common}>
        <circle cx="7.5" cy="6.5" r="2.75" ${stroke}></circle>
        <path ${stroke} d="M3.5 14.5c.8-2.1 2.5-3.3 4-3.3s3.2 1.2 4 3.3"></path>
        <path ${stroke} d="M15.25 6.25v5.5"></path>
        <path ${stroke} d="M12.5 9h5.5"></path>
      </svg>
    `,
    unassign: `
      <svg ${common}>
        <circle cx="7.5" cy="6.5" r="2.75" ${stroke}></circle>
        <path ${stroke} d="M3.5 14.5c.8-2.1 2.5-3.3 4-3.3s3.2 1.2 4 3.3"></path>
        <path ${stroke} d="M12.5 9h5.5"></path>
      </svg>
    `,
    complete: `
      <svg ${common}>
        <path ${stroke} d="M7 5l7 5-7 5V5z"></path>
      </svg>
    `,
    sendBack: `
      <svg ${common}>
        <path ${stroke} d="M12.5 5.2L6.2 10l6.3 4.8V5.2z"></path>
        <path ${stroke} d="M15.7 5.2L9.4 10l6.3 4.8V5.2z" opacity="0.72"></path>
      </svg>
    `,
    hold: `
      <svg ${common}>
        <path ${stroke} d="M7 5v10"></path>
        <path ${stroke} d="M13 5v10"></path>
      </svg>
    `,
    unhold: `
      <svg ${common}>
        <path ${stroke} d="M7 5l7 5-7 5V5z"></path>
      </svg>
    `,
    close: `
      <svg ${common}>
        <rect x="5.5" y="5.5" width="9" height="9" rx="1.25" ${stroke}></rect>
      </svg>
    `,
  };

  return icons[name] || "";
}

function iconButton({ action, icon, title, className = "", dataAttrs = {} }) {
  const attrs = Object.entries(dataAttrs)
    .map(([k, v]) => `${k}="${escapeHtml(v)}"`)
    .join(" ");

  return `
    <button
      class="btn btn-icon-only ${className}".trim()
      data-action="${escapeHtml(action)}"
      ${attrs}
      title="${escapeHtml(title)}"
      aria-label="${escapeHtml(title)}"
      type="button"
    >
      <span class="btn-icon">${actionIcon(icon)}</span>
    </button>
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

async function loadAssignableUsers() {
  if (!canAssignOthers()) return [];
  if (assignableUsers) return assignableUsers;

  const data = await apiGet("/api/admin/users/assignable");
  assignableUsers = data.items || [];
  return assignableUsers;
}

function ensureAssignDialog() {
  let dialog = document.getElementById("assignUserDialog");
  if (dialog) return dialog;

  dialog = document.createElement("dialog");
  dialog.id = "assignUserDialog";
  dialog.style.padding = "0";
  dialog.style.border = "none";
  dialog.style.borderRadius = "14px";
  dialog.style.maxWidth = "520px";
  dialog.style.width = "calc(100% - 24px)";
  dialog.style.boxShadow = "0 20px 60px rgba(0,0,0,0.35)";

  dialog.innerHTML = `
    <form method="dialog" id="assignUserForm" style="margin:0; padding:20px; display:grid; gap:14px; background:#fff; color:#111827;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
        <h3 style="margin:0; font-size:18px;">Tildel oppgave</h3>
        <button
          type="button"
          id="assignUserCancelX"
          class="btn btn-outline"
          style="padding:6px 10px;"
          aria-label="Lukk"
        >
          Lukk
        </button>
      </div>

      <div style="display:grid; gap:6px;">
        <label for="assignUserSelect" style="font-weight:700;">Velg bruker</label>
        <select id="assignUserSelect" style="width:100%; padding:10px 12px; border:1px solid #cbd5e1; border-radius:10px; background:#fff; color:#111827;"></select>
      </div>

      <div id="assignUserCurrent" style="font-size:13px; color:#64748b;"></div>

      <div style="display:flex; justify-content:flex-end; gap:10px;">
        <button type="button" id="assignUserCancelBtn" class="btn btn-outline">Avbryt</button>
        <button type="submit" id="assignUserOkBtn" class="btn btn-primary">
          <span class="btn-text">OK</span>
        </button>
      </div>
    </form>
  `;

  document.body.appendChild(dialog);

  const closeDialog = () => {
    if (dialog.open) dialog.close("cancel");
  };

  dialog.querySelector("#assignUserCancelBtn")?.addEventListener("click", closeDialog);
  dialog.querySelector("#assignUserCancelX")?.addEventListener("click", closeDialog);

  dialog.addEventListener("cancel", (ev) => {
    ev.preventDefault();
    closeDialog();
  });

  return dialog;
}

function waitForDialogClose(dialog) {
  return new Promise((resolve) => {
    const onClose = () => {
      dialog.removeEventListener("close", onClose);
      resolve(dialog.returnValue || "cancel");
    };
    dialog.addEventListener("close", onClose, { once: true });
  });
}

async function promptAssignUser(currentAssignedUserId = null) {
  const users = await loadAssignableUsers();

  if (!users.length) {
    throw new Error("Ingen tilgjengelige brukere å tildele til.");
  }

  const dialog = ensureAssignDialog();
  const selectEl = dialog.querySelector("#assignUserSelect");
  const currentEl = dialog.querySelector("#assignUserCurrent");
  const formEl = dialog.querySelector("#assignUserForm");

  selectEl.innerHTML = users
    .map((u) => {
      const label = escapeHtml((u.DisplayName || u.Username || `Bruker ${u.UserId}`).trim());
      const username = escapeHtml(u.Username || "");
      const selected = u.UserId === currentAssignedUserId ? "selected" : "";
      return `<option value="${u.UserId}" ${selected}>${label}${username ? ` (${username})` : ""}</option>`;
    })
    .join("");

  const currentUser = currentAssignedUserId == null
    ? null
    : users.find((u) => u.UserId === currentAssignedUserId) || null;

  currentEl.textContent = currentUser
    ? `Nåværende tildeling: ${currentUser.DisplayName || currentUser.Username} (${currentUser.Username})`
    : "Nåværende tildeling: Ikke tildelt";

  const submitHandler = (ev) => {
    ev.preventDefault();
    dialog.close("ok");
  };

  formEl.addEventListener("submit", submitHandler, { once: true });

  if (!dialog.open) {
    dialog.showModal();
  }

  const result = await waitForDialogClose(dialog);

  if (result !== "ok") {
    return null;
  }

  const selectedUserId = Number(selectEl.value);
  const selectedUser = users.find((u) => u.UserId === selectedUserId);

  if (!selectedUser) {
    throw new Error("Ugyldig valg av bruker.");
  }

  return selectedUser;
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
  const chkShowMineOnly = document.getElementById("chkShowMineOnly");

  return {
    showStopped: !!chkShowStopped?.checked,
    showPaused: !!chkShowPaused?.checked,
    showMineOnly: !!chkShowMineOnly?.checked,
  };
}

function isPausedOrder(it) {
  return it.OrderStatus === "OnHold";
}

function isStoppedOrder(it) {
  return (it.OrderStatus === "Closed" || it.OrderStatus === "Completed" || it.StepStatus === "Stopped");
}

function applyFilters(items) {
  const { showStopped, showPaused, showMineOnly } = readFilterState();

  return (items || []).filter(it => {
    if (!showStopped && isStoppedOrder(it)) return false;
    if (!showPaused && isPausedOrder(it)) return false;

    if (showMineOnly) {
      if (!me) return false;
      if (it.AssignedToUserId !== me.user_id) return false;
    }

    return true;
  });
}

function persistFilters() {
  const { showStopped, showPaused, showMineOnly } = readFilterState();

  localStorage.setItem(LS_SHOW_STOPPED, showStopped ? "1" : "0");
  localStorage.setItem(LS_SHOW_PAUSED, showPaused ? "1" : "0");
  localStorage.setItem(LS_SHOW_MINE_ONLY, showMineOnly ? "1" : "0");
}

function restoreFilters() {
  const chkShowStopped = document.getElementById("chkShowStopped");
  const chkShowPaused = document.getElementById("chkShowPaused");
  const chkShowMineOnly = document.getElementById("chkShowMineOnly");

  const sStopped = localStorage.getItem(LS_SHOW_STOPPED);
  const sPaused = localStorage.getItem(LS_SHOW_PAUSED);
  const sMineOnly = localStorage.getItem(LS_SHOW_MINE_ONLY);

  if (chkShowStopped) chkShowStopped.checked = (sStopped === "1");
  if (chkShowPaused) chkShowPaused.checked = (sPaused === null ? true : sPaused === "1");
  if (chkShowMineOnly) chkShowMineOnly.checked = (sMineOnly === "1");
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
  if (!me) return false;
  if (!isOrderOpenish(it)) return false;
  if (!isStepClaimableByStatus(it)) return false;

  if (canAssignOthers()) return true;

  return !isTaken(it);
}

/** "Frigi" allowed: order open, step not finished, and taken by me */
function canShowUnclaim(it) {
  if (!me) return false;
  if (!isOrderOpen(it)) return false;
  if (isStepFinished(it)) return false;
  if (!isTaken(it)) return false;

  if (canAssignOthers()) return true;

  return isTakenByMe(it);
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

function canShowSendBack(it) {
  if (!me) return false;
  if (!isOrderOpen(it)) return false;
  if (isStepFinished(it)) return false;
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

function assignedCell(it) {
  const parts = [];

  if (it.AssignedToUserName) {
    parts.push(userPill(it.AssignedToUserName));
  } else {
    parts.push(`<span class="queue-assigned-empty">Ikke tildelt</span>`);
  }

if (canShowClaim(it)) {
  parts.push(
    iconButton({
      action: "claim",
      icon: "assign",
      title: canAssignOthers() ? "Tildel eller endre tildeling" : "Tildel til meg",
      className: "btn-assign",
      dataAttrs: {
        "data-order-step-id": it.OrderStepId,
        "data-assigned-user-id": it.AssignedToUserId ?? "",
      },
    })
  );
}

  if (canShowUnclaim(it)) {
    parts.push(
      iconButton({
        action: "unclaim",
        icon: "unassign",
        title: "Fjern tildeling",
        className: "btn-assign",
        dataAttrs: {
          "data-order-step-id": it.OrderStepId,
        },
      })
    );
  }

  return `<div class="queue-assigned-cell">${parts.join("")}</div>`;
}

function controlsCell(it) {
  const parts = [];

  if (canShowComplete(it)) {
    parts.push(
      iconButton({
        action: "complete",
        icon: "complete",
        title: "Fullfør og gå videre",
        className: "btn-success",
        dataAttrs: {
          "data-order-step-id": it.OrderStepId,
        },
      })
    );
  }

  if (canShowSendBack(it)) {
    parts.push(
      iconButton({
        action: "send-back",
        icon: "sendBack",
        title: "Send tilbake",
        className: "btn-info",
        dataAttrs: {
          "data-order-step-id": it.OrderStepId,
        },
      })
    );
  }

  if (canShowHold(it)) {
    parts.push(
      iconButton({
        action: "hold",
        icon: "hold",
        title: "Sett på vent",
        className: "btn-warning",
        dataAttrs: {
          "data-order-id": it.OrderId,
        },
      })
    );
  }

  if (canShowUnhold(it)) {
    parts.push(
      iconButton({
        action: "unhold",
        icon: "unhold",
        title: "Ta av vent",
        className: "btn-success",
        dataAttrs: {
          "data-order-id": it.OrderId,
        },
      })
    );
  }

  if (canShowClose(it)) {
    parts.push(
      iconButton({
        action: "close",
        icon: "close",
        title: "Stopp ordre",
        className: "btn-danger",
        dataAttrs: {
          "data-order-id": it.OrderId,
        },
      })
    );
  }

  if (parts.length === 0) {
    return `<span style="color:#6b7280;">–</span>`;
  }

  return `<div class="queue-controls">${parts.join("")}</div>`;
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

        <td style="vertical-align:top;">${assignedCell(it)}</td>

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

      if (canAssignOthers()) {
        const currentAssignedUserIdRaw = btn.getAttribute("data-assigned-user-id");
        const currentAssignedUserId = currentAssignedUserIdRaw ? Number(currentAssignedUserIdRaw) : null;

        const selectedUser = await promptAssignUser(currentAssignedUserId);
        if (!selectedUser) return;

        setMsg(`Tildeler til ${selectedUser.DisplayName || selectedUser.Username}…`);
        await apiPost(`/api/wf/steps/${orderStepId}/assign`, {
          target_user_id: selectedUser.UserId,
        });
        assignableUsers = null;
        setMsg("Oppgave tildelt.");
      } else {
        setMsg("Tar oppgave…");
        await apiPost(`/api/wf/steps/${orderStepId}/claim`, {});
        setMsg("Oppgave tatt.");
      }
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

      if (action === "send-back") {
        const orderStepId = Number(btn.getAttribute("data-order-step-id"));

        const payload = await promptSendBack(orderStepId);
        if (!payload) return;

        setMsg(`Sender tilbake til ${payload.selected.StepName}…`);
        await apiPost(`/api/wf/steps/${orderStepId}/send-back`, {
          target_step_def_id: payload.target_step_def_id,
          reason: payload.reason,
          notes: payload.notes,
        });
        setMsg("Element sendt tilbake.");
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

async function promptSendBack(orderStepId) {
  const data = await apiGet(`/api/wf/steps/${orderStepId}/send-back-targets`);
  const items = data.items || [];

  if (!items.length) {
    throw new Error("Ingen tidligere steg er tilgjengelige for retur.");
  }

  const optionsText = items
    .map((it, idx) => `${idx + 1}: ${it.Sequence}. ${it.StepName}`)
    .join("\n");

  const selectedRaw = window.prompt(
    `Velg steg å sende tilbake til:\n\n${optionsText}\n\nSkriv nummeret foran steget:`,
    "1"
  );

  if (selectedRaw == null) {
    return null;
  }

  const selectedIndex = Number(selectedRaw.trim());
  if (!Number.isInteger(selectedIndex) || selectedIndex < 1 || selectedIndex > items.length) {
    throw new Error("Ugyldig valg av steg.");
  }

  const selected = items[selectedIndex - 1];

  const reason = (window.prompt("Årsak (påkrevd):", "RETURN") ?? "").trim();
  if (!reason) {
    throw new Error("Årsak er påkrevd.");
  }

  const notes = window.prompt("Kommentar (valgfritt):", "") ?? "";

  return {
    target_step_def_id: selected.StepDefId,
    reason,
    notes: notes.trim() || null,
    selected,
  };
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
  const chkShowMineOnly = document.getElementById("chkShowMineOnly");

  const onChange = () => {
    persistFilters();
    render(rawItems);
  };

  chkShowStopped?.addEventListener("change", onChange);
  chkShowPaused?.addEventListener("change", onChange);
  chkShowMineOnly?.addEventListener("change", onChange);
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