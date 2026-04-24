import { getToken, clearToken } from "./auth.js";
import { initUserMenu } from "./user_menu.js";

const API_BASE = "https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net";

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers: { ...authHeaders() } });

  if (res.status === 401) {
    clearToken();
    window.location.assign("/views/login.html");
    throw new Error("Ikke innlogget.");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || "Ukjent feil");
  return data;
}

function updateSummary(items) {
  const total = items.reduce((sum, x) => sum + Number(x.ItemCount || 0), 0);
  const active = items.reduce((sum, x) => sum + Number(x.ActiveCount || 0), 0);
  const pending = items.reduce((sum, x) => sum + Number(x.PendingCount || 0), 0);
  const blocked = items.reduce((sum, x) => sum + Number(x.BlockedCount || 0), 0);
  const onHold = items.reduce((sum, x) => sum + Number(x.OnHoldCount || 0), 0);
  const stopped = items.reduce((sum, x) => sum + Number(x.StoppedCount || 0), 0);

  document.getElementById("totalCount").textContent = total;
  document.getElementById("activeCount").textContent = active;
  document.getElementById("pendingCount").textContent = pending;
  document.getElementById("blockedHoldCount").textContent = blocked + onHold + stopped;
}

function heatClass(count, max) {
  if (!count) return "heat-0";
  const ratio = max ? count / max : 0;

  if (ratio >= 0.75) return "heat-4";
  if (ratio >= 0.50) return "heat-3";
  if (ratio >= 0.25) return "heat-2";
  return "heat-1";
}

function renderOverview(items) {
  const grid = document.getElementById("overviewGrid");
  if (!grid) return;

  const max = Math.max(...items.map(x => Number(x.ItemCount || 0)), 0);

  grid.innerHTML = items.map(item => {
    const count = Number(item.ItemCount || 0);
    const cls = heatClass(count, max);

    return `
      <a class="workflow-step-card ${cls}"
         href="/views/workflow_queue.html?step=${encodeURIComponent(item.StepDefId)}"
         title="Åpne kø for ${item.Sequence}. ${item.StepName}">
        <div class="workflow-step-card-top">
          <span class="workflow-step-number">${item.Sequence}</span>
          <span class="workflow-step-name">${item.StepName}</span>
        </div>

        <div class="workflow-step-count">${count}</div>

        <div class="workflow-step-breakdown">
            <span>Aktive: ${item.ActiveCount || 0}</span>
            <span>Ikke påbegynt: ${item.PendingCount || 0}</span>
            <span>Blokkert: ${item.BlockedCount || 0}</span>
            <span>På vent: ${item.OnHoldCount || 0}</span>
            <span>Stoppet: ${item.StoppedCount || 0}</span>
        </div>
      </a>
    `;
  }).join("");
}

async function refresh() {
  const msg = document.getElementById("msg");
  if (msg) msg.textContent = "Henter oversikt…";

  const data = await apiGet("/api/wf/overview/steps");
  const items = data.items || [];

  updateSummary(items);
  renderOverview(items);

  if (msg) msg.textContent = "OK";
}

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("refreshBtn")?.addEventListener("click", refresh);
  await refresh();
});