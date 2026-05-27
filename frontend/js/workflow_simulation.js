import { initProtectedPage, apiGet, apiPost } from "./page_auth.js";

const el = {
  weeks: document.getElementById("weeksInput"),
  target: document.getElementById("targetInput"),
  hours: document.getElementById("hoursInput"),
  batch: document.getElementById("batchInput"),
  step5Capacity: document.getElementById("step5CapacityInput"),
  step6Capacity: document.getElementById("step6CapacityInput"),
  cleanupShare: document.getElementById("cleanupShareInput"),
  seed: document.getElementById("seedInput"),
  msg: document.getElementById("simMsg"),
  runBtn: document.getElementById("runBtn"),
  resetBtn: document.getElementById("resetBtn"),
  stepConfigBody: document.getElementById("stepConfigBody"),
  stepResultBody: document.getElementById("stepResultBody"),
  flowViz: document.getElementById("flowViz"),
  bottleneckText: document.getElementById("bottleneckText"),
  targetKpi: document.getElementById("targetKpi"),
  grossKpi: document.getElementById("grossKpi"),
  scannedKpi: document.getElementById("scannedKpi"),
  releasedKpi: document.getElementById("releasedKpi"),
  gapKpi: document.getElementById("gapKpi"),
  cycleKpi: document.getElementById("cycleKpi"),
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

function formatHm(value, digits = 1) {
  return `${formatNumber(value, digits)} hm`;
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
    capacity_hm_per_week: Number(step.capacity_hm_per_week || 0),
    keep_pct: Number(step.keep_pct ?? 100),
    variability: Number(step.variability || 0),
    initial_backlog_hm: Number(step.initial_backlog_hm || 0),
  }));

  el.weeks.value = payload.weeks;
  el.target.value = payload.target_hm_per_week;
  el.hours.value = payload.hours_per_week;
  el.batch.value = payload.batch_hm;
  el.step5Capacity.value = payload.step5_capacity_hm;
  el.step6Capacity.value = payload.step6_capacity_hm;
  el.cleanupShare.value = Math.round(Number(payload.cleanup_destruction_share || 0) * 100);
  el.seed.value = payload.random_seed ?? "";

  renderStepConfig();
}

function renderStepConfig() {
  el.stepConfigBody.innerHTML = steps.map((step, index) => {
    const isStorage = step.kind === "storage";
    const keepDisabled = step.step_id > 3 ? "disabled" : "";
    const capacityDisabled = isStorage ? "disabled" : "";
    const capacityValue = isStorage ? "" : step.capacity_hm_per_week;
    const storageLabel = step.step_id === 5 ? "Maks 200 hm" : step.step_id === 6 ? "Eget felt over" : "";

    return `
      <tr>
        <td>
          <div class="workflow-sim-step-label">
            <strong>${escapeHtml(step.step_id)}. ${escapeHtml(step.name)}</strong>
            <span>${escapeHtml(step.kind)}</span>
          </div>
        </td>
        <td>
          <input data-step-index="${index}" data-field="capacity_hm_per_week" type="number" min="0" max="10000" step="0.5" value="${escapeHtml(capacityValue)}" ${capacityDisabled} />
          ${storageLabel ? `<small>${escapeHtml(storageLabel)}</small>` : ""}
        </td>
        <td><input data-step-index="${index}" data-field="keep_pct" type="number" min="0" max="100" step="1" value="${escapeHtml(step.keep_pct)}" ${keepDisabled} /></td>
        <td><input data-step-index="${index}" data-field="variability" type="number" min="0" max="3" step="0.05" value="${escapeHtml(step.variability)}" ${capacityDisabled} /></td>
        <td><input data-step-index="${index}" data-field="initial_backlog_hm" type="number" min="0" max="10000" step="0.5" value="${escapeHtml(step.initial_backlog_hm || 0)}" /></td>
      </tr>
    `;
  }).join("");
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
    weeks: Math.max(1, Math.round(Number(el.weeks.value || 12))),
    hours_per_week: Math.max(1, Number(el.hours.value || 37.5)),
    target_hm_per_week: Math.max(0, Number(el.target.value || 0)),
    batch_hm: Math.max(0.1, Number(el.batch.value || 1)),
    step5_capacity_hm: Math.max(1, Number(el.step5Capacity.value || 200)),
    step6_capacity_hm: Math.max(1, Number(el.step6Capacity.value || 50)),
    cleanup_destruction_share: Math.min(1, Math.max(0, Number(el.cleanupShare.value || 0) / 100)),
    random_seed: el.seed.value === "" ? null : Number(el.seed.value),
    steps: steps.map(step => ({
      step_id: Number(step.step_id),
      name: String(step.name || `Steg ${step.step_id}`),
      kind: String(step.kind || "process"),
      capacity_hm_per_week: Math.max(0, Number(step.capacity_hm_per_week || 0)),
      keep_pct: Math.min(100, Math.max(0, Number(step.keep_pct ?? 100))),
      variability: Math.max(0, Number(step.variability || 0)),
      initial_backlog_hm: Math.max(0, Number(step.initial_backlog_hm || 0)),
    })),
  };
}

function renderKpis(result) {
  const gap = Number(result.target_gap_hm_per_week || 0);
  el.targetKpi.textContent = `${formatHm(result.target_hm_per_week)} / uke`;
  el.grossKpi.textContent = `${formatHm(result.gross_needed_hm_per_week)} / uke`;
  el.scannedKpi.textContent = `${formatHm(result.scanned_hm_per_week)} / uke`;
  el.releasedKpi.textContent = `${formatHm(result.released_hm_per_week)} / uke`;
  el.gapKpi.textContent = `${gap >= 0 ? "+" : ""}${formatHm(gap)} / uke`;
  el.gapKpi.classList.toggle("workflow-sim-result-good", gap >= 0);
  el.gapKpi.classList.toggle("workflow-sim-result-bad", gap < 0);
  el.cycleKpi.textContent = `${formatNumber(result.p95_cycle_time_hours, 1)} t`;
}

function renderBottleneck(result) {
  const top = result.bottlenecks?.[0];
  if (!top) {
    el.bottleneckText.textContent = "Ingen flaskehals funnet.";
    return;
  }

  const kindText = top.storage_capacity_hm
    ? `maks ${formatHm(top.max_wip_hm)} av ${formatHm(top.storage_capacity_hm)}`
    : `${formatNumber(top.utilization * 100, 0)}% utnyttelse`;

  el.bottleneckText.textContent =
    `${top.step_id}. ${top.name}: ${kindText}, blokkert ${formatNumber(top.blocked_hours, 1)} t`;
}

function renderFlow(result) {
  el.flowViz.innerHTML = (result.steps || []).map((step, index) => {
    const utilPct = Math.round(Number(step.utilization || 0) * 100);
    const capacityText = step.storage_capacity_hm
      ? `${formatHm(step.max_wip_hm)} / ${formatHm(step.storage_capacity_hm)}`
      : `${formatHm(step.output_hm_per_week)} / uke`;

    return `
      <div class="workflow-sim-node ${heatClass(step.utilization)}">
        <div class="workflow-sim-node-top">
          <span>${escapeHtml(step.step_id)}</span>
          <strong>${escapeHtml(step.name)}</strong>
        </div>
        <div class="workflow-sim-node-metric">
          <span>${step.storage_capacity_hm ? "Lager" : "Ut"}</span>
          <strong>${escapeHtml(capacityText)}</strong>
        </div>
        <div class="workflow-sim-meter"><span style="width:${Math.min(utilPct, 100)}%;"></span></div>
        <div class="workflow-sim-node-foot">
          <span>Behov ${formatHm(step.required_hm_per_week)}</span>
          <span>${formatNumber(utilPct)}%</span>
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

  el.stepResultBody.innerHTML = (result.steps || []).map(step => {
    const capacityText = step.storage_capacity_hm
      ? `${formatHm(step.storage_capacity_hm)} lager`
      : `${formatHm(step.capacity_hm_per_week)} / uke`;
    const waitText = step.storage_capacity_hm
      ? `${formatNumber(step.blocked_hours, 1)} t blokk`
      : `${formatNumber(step.p95_wait_hours, 1)} t P95`;
    const wipText = step.storage_capacity_hm
      ? `${formatHm(step.wip_hm)} / ${formatHm(step.max_wip_hm)}`
      : formatHm(step.wip_hm);

    return `
      <tr>
        <td>${escapeHtml(step.step_id)}. ${escapeHtml(step.name)}</td>
        <td>${formatHm(step.required_hm_per_week)}</td>
        <td>${capacityText}</td>
        <td>${formatHm(step.output_hm_per_week)}</td>
        <td>${formatNumber(step.utilization * 100, 0)}%</td>
        <td>${waitText}</td>
        <td>${wipText}</td>
      </tr>
    `;
  }).join("");
}

async function runSimulation() {
  try {
    setLoading(true);
    setMsg("Kjorer simulering...");
    const result = await apiPost("/api/wf/simulation/run", buildPayload());
    renderResults(result);
    setMsg(
      result.target_met
        ? `Maalet nas med ${formatHm(result.released_hm_per_week)} per uke.`
        : `Mangler ${formatHm(Math.abs(result.target_gap_hm_per_week))} per uke for a na maalet.`,
      !result.target_met,
    );
  } catch (err) {
    setMsg(err.message || "Kunne ikke kjore simulering.", true);
  } finally {
    setLoading(false);
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
