import { initProtectedPage, apiGet, apiPost } from "./page_auth.js";

const el = {
  days: document.getElementById("daysInput"),
  hours: document.getElementById("hoursInput"),
  arrivals: document.getElementById("arrivalsInput"),
  seed: document.getElementById("seedInput"),
  msg: document.getElementById("simMsg"),
  runBtn: document.getElementById("runBtn"),
  loadCurrentBtn: document.getElementById("loadCurrentBtn"),
  resetBtn: document.getElementById("resetBtn"),
  stepConfigBody: document.getElementById("stepConfigBody"),
  stepResultBody: document.getElementById("stepResultBody"),
  flowViz: document.getElementById("flowViz"),
  bottleneckText: document.getElementById("bottleneckText"),
  completedKpi: document.getElementById("completedKpi"),
  throughputKpi: document.getElementById("throughputKpi"),
  cycleKpi: document.getElementById("cycleKpi"),
  cycleP95Kpi: document.getElementById("cycleP95Kpi"),
};

let defaults = null;
let steps = [];

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat("nb-NO", {
    maximumFractionDigits: digits,
  }).format(Number(value || 0));
}

function setMsg(text, isError = false) {
  if (!el.msg) return;
  el.msg.textContent = text || "";
  el.msg.style.color = isError ? "#ffb4b4" : "#ffffff";
}

function setLoading(isLoading) {
  el.runBtn?.classList.toggle("is-loading", isLoading);
  if (el.runBtn) el.runBtn.disabled = isLoading;
}

function heatClass(utilization) {
  if (utilization >= 0.95) return "sim-heat-critical";
  if (utilization >= 0.80) return "sim-heat-high";
  if (utilization >= 0.60) return "sim-heat-medium";
  if (utilization > 0) return "sim-heat-low";
  return "sim-heat-empty";
}

function setDefaults(payload) {
  defaults = JSON.parse(JSON.stringify(payload));
  steps = (payload.steps || []).map(step => ({
    ...step,
    initial_backlog: Number(step.initial_backlog || 0),
  }));

  el.days.value = payload.days;
  el.hours.value = payload.hours_per_day;
  el.arrivals.value = payload.arrivals_per_day;
  el.seed.value = payload.random_seed ?? "";

  renderStepConfig();
}

function renderStepConfig() {
  el.stepConfigBody.innerHTML = steps.map((step, index) => `
    <tr>
      <td>
        <div class="workflow-sim-step-label">
          <strong>${escapeHtml(step.step_id)}. ${escapeHtml(step.name)}</strong>
        </div>
      </td>
      <td><input data-step-index="${index}" data-field="workers" type="number" min="1" max="100" step="1" value="${escapeHtml(step.workers)}" /></td>
      <td><input data-step-index="${index}" data-field="mean_hours" type="number" min="0.1" max="1000" step="0.25" value="${escapeHtml(step.mean_hours)}" /></td>
      <td><input data-step-index="${index}" data-field="variability" type="number" min="0" max="3" step="0.05" value="${escapeHtml(step.variability)}" /></td>
      <td><input data-step-index="${index}" data-field="initial_backlog" type="number" min="0" max="20000" step="1" value="${escapeHtml(step.initial_backlog || 0)}" /></td>
    </tr>
  `).join("");
}

function syncStepFromInput(input) {
  const index = Number(input.dataset.stepIndex);
  const field = input.dataset.field;
  if (!Number.isInteger(index) || !steps[index] || !field) return;

  const value = Number(input.value);
  steps[index][field] = Number.isFinite(value) ? value : 0;
}

function buildPayload() {
  return {
    days: Number(el.days.value || 30),
    hours_per_day: Number(el.hours.value || 7.5),
    arrivals_per_day: Number(el.arrivals.value || 0),
    random_seed: el.seed.value === "" ? null : Number(el.seed.value),
    steps: steps.map(step => ({
      step_id: Number(step.step_id),
      name: String(step.name || `Steg ${step.step_id}`),
      workers: Math.max(1, Math.round(Number(step.workers || 1))),
      mean_hours: Math.max(0.1, Number(step.mean_hours || 0.1)),
      variability: Math.max(0, Number(step.variability || 0)),
      initial_backlog: Math.max(0, Math.round(Number(step.initial_backlog || 0))),
    })),
  };
}

function renderKpis(result) {
  el.completedKpi.textContent = formatNumber(result.completed_items);
  el.throughputKpi.textContent = `${formatNumber(result.throughput_per_day, 2)} / dag`;
  el.cycleKpi.textContent = `${formatNumber(result.avg_cycle_time_hours, 1)} t`;
  el.cycleP95Kpi.textContent = `${formatNumber(result.p95_cycle_time_hours, 1)} t`;
}

function renderBottleneck(result) {
  const top = result.bottlenecks?.[0];
  if (!top) {
    el.bottleneckText.textContent = "Ingen flaskehals funnet.";
    return;
  }

  el.bottleneckText.textContent =
    `Mest belastet: ${top.step_id}. ${top.name} ` +
    `(${formatNumber(top.utilization * 100, 0)}% utnyttelse, P95 vent ${formatNumber(top.p95_wait_hours, 1)} t)`;
}

function renderFlow(result) {
  el.flowViz.innerHTML = (result.steps || []).map((step, index) => {
    const utilPct = Math.round(Number(step.utilization || 0) * 100);
    return `
      <div class="workflow-sim-node ${heatClass(step.utilization)}">
        <div class="workflow-sim-node-top">
          <span>${escapeHtml(step.step_id)}</span>
          <strong>${escapeHtml(step.name)}</strong>
        </div>
        <div class="workflow-sim-node-metric">
          <span>Utnyttelse</span>
          <strong>${formatNumber(utilPct)}%</strong>
        </div>
        <div class="workflow-sim-meter"><span style="width:${Math.min(utilPct, 100)}%;"></span></div>
        <div class="workflow-sim-node-foot">
          <span>Vent ${formatNumber(step.avg_wait_hours, 1)} t</span>
          <span>WIP ${formatNumber(step.wip)}</span>
        </div>
      </div>
      ${index < result.steps.length - 1 ? '<div class="workflow-sim-arrow" aria-hidden="true">&rarr;</div>' : ''}
    `;
  }).join("");
}

function renderResults(result) {
  renderKpis(result);
  renderBottleneck(result);
  renderFlow(result);

  el.stepResultBody.innerHTML = (result.steps || []).map(step => `
    <tr>
      <td>${escapeHtml(step.step_id)}. ${escapeHtml(step.name)}</td>
      <td>${formatNumber(step.utilization * 100, 0)}%</td>
      <td>${formatNumber(step.avg_wait_hours, 1)} t</td>
      <td>${formatNumber(step.p95_wait_hours, 1)} t</td>
      <td>${formatNumber(step.wip)}</td>
    </tr>
  `).join("");
}

async function runSimulation() {
  try {
    setLoading(true);
    setMsg("Kjorer simulering...");
    const result = await apiPost("/api/wf/simulation/run", buildPayload());
    renderResults(result);
    setMsg(`Ferdig. ${formatNumber(result.created_items)} saker simulert over ${formatNumber(result.horizon_hours, 1)} timer.`);
  } catch (err) {
    setMsg(err.message || "Kunne ikke kjore simulering.", true);
  } finally {
    setLoading(false);
  }
}

async function loadCurrentQueue() {
  try {
    setMsg("Henter dagens ko...");
    const data = await apiGet("/api/wf/overview/steps");
    const byStep = new Map((data.items || []).map(item => [
      Number(item.StepDefId),
      Number(item.ItemCount || 0),
    ]));

    steps = steps.map(step => ({
      ...step,
      initial_backlog: byStep.get(Number(step.step_id)) || 0,
    }));

    renderStepConfig();
    setMsg("Startko er oppdatert fra dagens workflow-ko.");
  } catch (err) {
    setMsg(err.message || "Kunne ikke hente dagens ko.", true);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const me = await initProtectedPage();
  if (!me) return;

  el.stepConfigBody.addEventListener("input", event => {
    const input = event.target.closest?.("input[data-step-index]");
    if (input) syncStepFromInput(input);
  });

  el.runBtn.addEventListener("click", runSimulation);
  el.loadCurrentBtn.addEventListener("click", loadCurrentQueue);
  el.resetBtn.addEventListener("click", () => {
    if (defaults) setDefaults(defaults);
    setMsg("Tilbakestilt.");
  });

  try {
    setMsg("Laster standardverdier...");
    const data = await apiGet("/api/wf/simulation/defaults");
    setDefaults(data);
    await runSimulation();
  } catch (err) {
    setMsg(err.message || "Kunne ikke laste simuleringsverktoyet.", true);
  }
});
