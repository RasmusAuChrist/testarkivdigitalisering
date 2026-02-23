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

let me = null; // { user_id, username, roles, ... }

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

function canClaimRow(it) {
  // Claim allowed if not assigned, or assigned to me
  if (!me) return false;

  const assignedTo = it.AssignedToUserId;
  const stepStatus = it.StepStatus;

  // Only sensible to claim Pending/Active/Blocked in our model
  if (!["Pending", "Active", "Blocked"].includes(stepStatus)) return false;

  // If assigned to someone else, only Admin can override (we’ll add override later)
  if (assignedTo && assignedTo !== me.user_id) return false;

  // Pending is claimable; Active/Blocked claimable if unassigned or mine
  return true;
}

function render(items) {
  const tbody = document.getElementById("tbody");
  const countBox = document.getElementById("countBox");
  countBox.textContent = `Antall: ${items.length}`;

  tbody.innerHTML = items.map(it => {
    const claimBtn = canClaimRow(it)
      ? `<button class="btn btn-primary" data-claim="${it.OrderStepId}">
           <span class="btn-text">Ta</span>
         </button>`
      : `<span class="muted">—</span>`;

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
        <td>${claimBtn}</td>
      </tr>
    `;
  }).join("");

  // Wire claim buttons
  tbody.querySelectorAll("button[data-claim]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const orderStepId = Number(btn.getAttribute("data-claim"));
      if (!orderStepId) return;

      try {
        btn.disabled = true;
        setMsg("Tar oppgave…");
        await apiPost(`/api/wf/steps/${orderStepId}/claim`, {});
        setMsg("Oppgave tatt.");
        await refresh();
      } catch (e) {
        setMsg(e.message || "Feil ved taking.", true);
      } finally {
        btn.disabled = false;
      }
    });
  });
}

async function refresh() {
  const stepDefId = Number(document.getElementById("stepSelect").value);
  setMsg("Henter kø…");
  const data = await apiGet(`/api/wf/steps/${stepDefId}/queue`);
  render(data.items || []);
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

document.addEventListener("DOMContentLoaded", async () => {
  await loadNavbar();

  document.getElementById("logoutBtn").addEventListener("click", () => {
    clearToken();
    window.location.assign("/views/login.html");
  });

  initStepSelect();

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