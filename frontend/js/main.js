import { initProtectedPage, apiGet } from "./page_auth.js";

const CHART_LOAD_TIMEOUT_MS = 20000;

const workflowSteps = [
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

function parseNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const normalized = String(value)
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat("nb-NO", {
    maximumFractionDigits: digits,
  }).format(Number(value || 0));
}

function shortStepLabel(label) {
  return String(label || "")
    .replace("Opprydning for destruksjon - gjelder både fysisk og digitalt", "Opprydning destruksjon")
    .replace("Opplasting og innlemming", "Opplasting")
    .replace("Etterarbeid skanning", "Etterarbeid")
    .replace("Metadata etterarbeid", "Metadata")
    .replace("Opprydning for videresending", "Opprydning videresending");
}

function setChartLoading(canvasId, isLoading) {
  const canvas = document.getElementById(canvasId);
  const wrap = canvas?.closest(".chart-canvas-wrap");
  if (!wrap) return;

  wrap.classList.toggle("is-loading", isLoading);
  wrap.setAttribute("aria-busy", String(isLoading));
}

function apiGetWithTimeout(path, timeoutMs = CHART_LOAD_TIMEOUT_MS) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error("Tidsavbrudd ved lasting av diagram.")), timeoutMs);
  });

  return Promise.race([
    apiGet(path),
    timeout,
  ]).finally(() => window.clearTimeout(timeoutId));
}

function getAssignedUsers(item) {
  if (Array.isArray(item?.AssignedUsers)) return item.AssignedUsers;

  try {
    const parsed = JSON.parse(item?.AssignedUsersJson || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const workflowStatusGroups = [
  { id: "assigned", label: "Tildelt", color: "#16a34a" },
  { id: "onHold", label: "På vent", color: "#d97706" },
  { id: "pending", label: "Ikke påbegynt", color: "#fdd835" },
  { id: "blocked", label: "Blokkert", color: "#dc2626" },
  { id: "completed", label: "Fullført", color: "#2563eb" },
  { id: "stopped", label: "Stoppet", color: "#111827" },
];

function getWorkflowStatusGroup(item) {
  if (item?.OrderStatus === "OnHold") return "onHold";
  if (item?.OrderStatus === "Closed" || item?.OrderStatus === "Completed") return "stopped";
  if (item?.StepStatus === "Stopped") return "stopped";
  if (item?.StepStatus === "Completed") return "completed";
  if (item?.StepStatus === "Blocked") return "blocked";
  if (getAssignedUsers(item).length > 0) return "assigned";
  return "pending";
}

const stackTotalLabelsPlugin = {
  id: "stackTotalLabels",
  afterDatasetsDraw(chart) {
    const totals = chart.$stackTotals || [];
    const { ctx, scales } = chart;
    const xScale = scales.x;
    const yScale = scales.y;

    if (!xScale || !yScale || !totals.length) return;

    ctx.save();
    ctx.fillStyle = "#111827";
    ctx.font = "700 11px Segoe UI, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";

    totals.forEach((total, index) => {
      if (!total) return;

      const x = typeof xScale.getPixelForTick === "function"
        ? xScale.getPixelForTick(index)
        : xScale.getPixelForValue(index);
      const y = yScale.getPixelForValue(total);
      ctx.fillText(formatNumber(total, 1), x, y - 5);
    });

    ctx.restore();
  },
};

document.addEventListener("DOMContentLoaded", async () => {

  // 1. Always hide splash after 2 seconds
  setTimeout(() => {
    const splash = document.getElementById("splash-screen");
    if (splash) splash.style.display = "none";

    const main = document.getElementById("main-content");
    if (main) main.style.display = "block";
  }, 2000);

  // 2. THEN check login
  const me = await initProtectedPage();
  if (!me) return;

  console.log("Dashboard loaded");

  setupChartFullscreen();

  const goBtn = document.getElementById("go-to-location");
  if (goBtn) {
    goBtn.addEventListener("click", () => {
      window.location.href = "views/location.html";
    });
  }

  await Promise.all([
    buildWorkflowHyllemeterChart(),
    buildSahSummaryChart(),
  ]);

});/**
 * Smooth fullscreen for .chart-box tiles using FLIP animation.
 * Matches CSS:
 * - body.no-scroll
 * - body.dashboard-fullscreen
 * - #chart-fullscreen-backdrop
 * - .chart-box.is-fullscreen
 */
function setupChartFullscreen() {
  const tiles = Array.from(document.querySelectorAll(".chart-box"));
  if (!tiles.length) return;

  // Create backdrop once (no HTML change needed)
  let backdrop = document.getElementById("chart-fullscreen-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.id = "chart-fullscreen-backdrop";
    document.body.appendChild(backdrop);
  }

  let activeTile = null;
  let isAnimating = false;

  // Clicking backdrop closes
  backdrop.addEventListener("click", () => {
    if (activeTile) exitFullscreen();
  });

  // ESC closes
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && activeTile) exitFullscreen();
  });

  tiles.forEach(tile => {
    // Ensure X exists
    if (!tile.querySelector(".chart-close-btn")) {
      const computed = window.getComputedStyle(tile);
      if (computed.position === "static") tile.style.position = "relative";

      const btn = document.createElement("button");
      btn.className = "chart-close-btn";
      btn.type = "button";
      btn.setAttribute("aria-label", "Lukk fullskjerm");
      btn.textContent = "✕";
      tile.appendChild(btn);

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        exitFullscreen();
      });
    }

    // Click tile -> fullscreen
    tile.addEventListener("click", (e) => {
      if (isAnimating) return;
      if (tile.classList.contains("is-fullscreen")) return;

      // Safety: don't trigger if the click came from an interactive element inside the tile
      const t = e.target;
      if (t instanceof HTMLElement) {
        if (t.closest("button, a, input, select, textarea, label")) return;
      }

      enterFullscreen(tile);
    });
  });

  function enterFullscreen(tile) {
    isAnimating = true;

    // FLIP: First (tile in grid)
    const first = tile.getBoundingClientRect();

    activeTile = tile;

    // Apply fullscreen state (CSS uses these)
    document.body.classList.add("no-scroll", "dashboard-fullscreen");
    tile.classList.add("is-fullscreen");

    // Force fullscreen layout to compute "last"
    tile.getBoundingClientRect();

    // FLIP: Last (tile fullscreen)
    const last = tile.getBoundingClientRect();

    // Invert
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    const sx = first.width / last.width;
    const sy = first.height / last.height;

    tile.style.transformOrigin = "top left";
    tile.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;

    // Play
    requestAnimationFrame(() => {
      tile.style.transition = "transform 260ms cubic-bezier(.2,.8,.2,1)";
      tile.style.transform = "translate(0px, 0px) scale(1, 1)";
    });

    // Resize charts near end
    setTimeout(() => requestChartResize(tile), 180);

    tile.addEventListener("transitionend", () => {
      tile.style.transition = "";
      tile.style.transform = "";
      isAnimating = false;
      requestChartResize(tile);
    }, { once: true });
  }

  function exitFullscreen() {
    if (!activeTile || isAnimating) return;
    isAnimating = true;

    const tile = activeTile;

    // FLIP: First (fullscreen)
    const first = tile.getBoundingClientRect();

    // Remove fullscreen class so it returns to grid position
    tile.classList.remove("is-fullscreen");

    // Force layout (grid position becomes measurable)
    tile.getBoundingClientRect();

    // FLIP: Last (grid)
    const last = tile.getBoundingClientRect();

    const dx = first.left - last.left;
    const dy = first.top - last.top;
    const sx = first.width / last.width;
    const sy = first.height / last.height;

    tile.style.transformOrigin = "top left";
    tile.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;

    requestAnimationFrame(() => {
      tile.style.transition = "transform 260ms cubic-bezier(.2,.8,.2,1)";
      tile.style.transform = "translate(0px, 0px) scale(1, 1)";
    });

    // IMPORTANT: remove body classes *after* animation so other tiles don't "pop"
    tile.addEventListener("transitionend", () => {
      tile.style.transition = "";
      tile.style.transform = "";

      document.body.classList.remove("no-scroll", "dashboard-fullscreen");

      activeTile = null;
      isAnimating = false;

      requestChartResize(tile);
    }, { once: true });
  }

  function requestChartResize(tile) {
    const canvases = tile.querySelectorAll("canvas");
    canvases.forEach((c) => {
      if (window.Chart && typeof window.Chart.getChart === "function") {
        const chart = window.Chart.getChart(c);
        if (chart) chart.resize();
      }
    });
  }
}

async function buildWorkflowHyllemeterChart() {
  const canvasId = "statusChart";
  const ctx = document.getElementById(canvasId)?.getContext("2d");
  if (!ctx) return;

  setChartLoading(canvasId, true);

  try {
    const data = await apiGetWithTimeout("/api/wf/steps/queue");
    const items = Array.isArray(data?.items) ? data.items : [];
    const hyllemeterByStatus = new Map();
    const nameByStep = new Map(workflowSteps.map(step => [step.id, step.name]));

    workflowStatusGroups.forEach(group => {
      hyllemeterByStatus.set(group.id, new Map());
    });

    items.forEach(item => {
      const stepId = Number(item.StepDefId);
      if (!Number.isFinite(stepId)) return;

      const statusGroup = getWorkflowStatusGroup(item);
      const hyllemeterByStep = hyllemeterByStatus.get(statusGroup);
      const current = hyllemeterByStep.get(stepId) || 0;
      hyllemeterByStep.set(stepId, current + parseNumber(item.Hyllemeter));

      if (item.StepName && !nameByStep.has(stepId)) {
        nameByStep.set(stepId, item.StepName);
      }
    });

    const stepIds = [...new Set([
      ...workflowSteps.map(step => step.id),
      ...[...hyllemeterByStatus.values()].flatMap(stepMap => [...stepMap.keys()]),
    ])].sort((a, b) => a - b);

    const labels = stepIds.map(stepId => shortStepLabel(nameByStep.get(stepId) || `Steg ${stepId}`));
    const totals = stepIds.map(stepId =>
      workflowStatusGroups.reduce((sum, group) => {
        const value = hyllemeterByStatus.get(group.id)?.get(stepId) || 0;
        return sum + value;
      }, 0)
    );

    const datasets = workflowStatusGroups.map(group => ({
      label: group.label,
      data: stepIds.map(stepId => Number((hyllemeterByStatus.get(group.id)?.get(stepId) || 0).toFixed(2))),
      backgroundColor: group.color,
      borderColor: "#ffffff",
      borderWidth: 1,
      stack: "workflowHyllemeter",
    }));

    const chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets,
      },
      plugins: [stackTotalLabelsPlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: { top: 22 },
        },
        plugins: {
          title: { display: true, text: "Bekreftet hyllemeter per workflow-steg og status" },
          legend: { position: "bottom" },
          tooltip: {
            mode: "index",
            intersect: false,
            callbacks: {
              label: context => `${context.dataset.label}: ${formatNumber(context.parsed.y, 2)} hyllemeter`,
              footer: contexts => {
                const total = contexts.reduce((sum, context) => sum + Number(context.parsed.y || 0), 0);
                return `Totalt: ${formatNumber(total, 2)} hyllemeter`;
              },
            },
          },
        },
        scales: {
          x: {
            stacked: true,
            ticks: { autoSkip: false, maxRotation: 45, minRotation: 30 },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            grace: "12%",
            title: { display: true, text: "Hyllemeter" },
            ticks: {
              callback: value => formatNumber(value, 0),
            },
          },
        },
      },
    });

    chart.$stackTotals = totals;
    chart.update();
  } catch (err) {
    console.error("Kunne ikke laste hyllemeter per workflow-steg:", err);
  } finally {
    setChartLoading(canvasId, false);
  }
}

async function buildSahSummaryChart() {
  const canvasId = "chart2";
  const ctx = document.getElementById(canvasId)?.getContext("2d");
  if (!ctx) return;

  setChartLoading(canvasId, true);

  try {
    const data = await apiGetWithTimeout("/api/sah-items?page=1&page_size=1");
    const summary = data?.summary || {};
    const moved = Number(summary.moved_correctly || 0);
    const notMoved = Number(summary.not_moved || 0);
    const deviations = Number(summary.deviations || 0);
    const total = Number(summary.total_items || (moved + notMoved + deviations));
    const progress = Number(summary.progress_percent || 0);

    new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: ["Flyttet korrekt", "Ikke flyttet", "Avvik"],
        datasets: [{
          data: [moved, notMoved, deviations],
          backgroundColor: ["#188038", "#fbbc04", "#c5221f"],
          borderColor: "#ffffff",
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: `SAH Hamar: ${formatNumber(total)} stykker, ${formatNumber(progress, 2)}% flyttet`,
          },
          legend: { position: "bottom" },
          tooltip: {
            callbacks: {
              label: context => {
                const value = Number(context.parsed || 0);
                const percent = total ? (value / total) * 100 : 0;
                return `${context.label}: ${formatNumber(value)} (${formatNumber(percent, 1)}%)`;
              },
            },
          },
        },
      },
    });
  } catch (err) {
    console.error("Kunne ikke laste SAH Hamar-sammendrag:", err);
  } finally {
    setChartLoading(canvasId, false);
  }
}
