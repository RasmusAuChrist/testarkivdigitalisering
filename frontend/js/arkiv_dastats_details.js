import { initProtectedPage, apiGet } from "./page_auth.js";

function getUrlParam(name) {
  const v = new URLSearchParams(window.location.search).get(name);
  return v ? v.trim() : "";
}

const el = {
  subTitle: document.getElementById("subTitle"),
  backBtn: document.getElementById("backBtn"),
  statusLine: document.getElementById("statusLine"),
  canvas: document.getElementById("viewsChart"),
  loading: document.getElementById("loadingOverlay"),
  toggleMedia: document.getElementById("toggleMedia"),
  toggleDigark: document.getElementById("toggleDigark"),
  toggleInternalViews: document.getElementById("toggleInternalViews"),
};

function showLoading() { if (el.loading) el.loading.style.display = "flex"; }
function hideLoading() { if (el.loading) el.loading.style.display = "none"; }

async function fetchHistory(arkivSk) {
  return await apiGet(`/api/arkiv/${encodeURIComponent(arkivSk)}/dastats-views-history`);
}


function formatMMYYYY(isoDate) {
  const d = new Date(isoDate + "T00:00:00");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${mm} ${yyyy}`;
}

let chart;

function wireToggles() {
  const apply = () => {
    if (!chart) return;
    chart.setDatasetVisibility(0, !!el.toggleMedia?.checked);
    chart.setDatasetVisibility(1, !!el.toggleDigark?.checked);
    chart.setDatasetVisibility(2, !!el.toggleInternalViews?.checked);
    chart.update();
  };

  el.toggleMedia?.addEventListener("change", apply);
  el.toggleDigark?.addEventListener("change", apply);
  el.toggleInternalViews?.addEventListener("change", apply);
  return apply;
}

function buildChart(points) {
  const rawDates = points.map(p => p.date);
  const labels = rawDates.map(formatMMYYYY);

  const media = points.map(p => Number(p.media || 0));
  const digark = points.map(p => Number(p.digark || 0));
  const internalViews = points.map(p => Number(p.internal_views || 0));

  if (chart) chart.destroy();

  chart = new Chart(el.canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
  {
    label: "Media",
    data: media,
    tension: 0.25,
    pointRadius: 2,
    pointHoverRadius: 4,
  },
  {
    label: "Digark",
    data: digark,
    tension: 0.25,
    pointRadius: 2,
    pointHoverRadius: 4,
  },
  {
    label: "Interne visninger",
    data: internalViews,
    tension: 0.25,
    pointRadius: 2,
    pointHoverRadius: 4,
  },
],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "top" },
        tooltip: {
          callbacks: {
            title: (items) => {
              const idx = items?.[0]?.dataIndex ?? 0;
              return `${formatMMYYYY(rawDates[idx])}`;
            }
          }
        }
      },
      scales: {
        x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
        y: { beginAtZero: true, ticks: { precision: 0 } },
      },
    },
  });

  const apply = wireToggles();
  if (apply) apply();
}

async function init() {
  const me = await initProtectedPage();
  if (!me) return;

  const arkivSk = getUrlParam("arkiv_sk");
  const ident = getUrlParam("ident");
  const kind = getUrlParam("kind");

  el.subTitle.textContent = ident
    ? `Identifikator: ${ident} (arkiv_sk=${arkivSk})`
    : `arkiv_sk=${arkivSk}`;

  el.backBtn?.addEventListener("click", () => history.back());

  if (!arkivSk) {
    el.statusLine.textContent = "Mangler arkiv_sk i URL.";
    return;
  }

  // If link came from a specific total cell, hide the other line by default
if (kind === "media") {
  if (el.toggleDigark) el.toggleDigark.checked = false;
  if (el.toggleInternalViews) el.toggleInternalViews.checked = false;
}

if (kind === "digark") {
  if (el.toggleMedia) el.toggleMedia.checked = false;
  if (el.toggleInternalViews) el.toggleInternalViews.checked = false;
}

if (kind === "internal_views") {
  if (el.toggleMedia) el.toggleMedia.checked = false;
  if (el.toggleDigark) el.toggleDigark.checked = false;
}

  showLoading();
  try {
    el.statusLine.textContent = "Laster data…";
    const data = await fetchHistory(arkivSk);
    const points = data.points || [];

    if (!points.length) {
      el.statusLine.textContent = "Ingen historikk funnet.";
      buildChart([{ date: "2000-01-01", media: 0, digark: 0, internal_views: 0 }]);
      return;
    }

    el.statusLine.textContent = `Punkter: ${points.length.toLocaleString("no-NO")}`;
    buildChart(points);
  } catch (err) {
    console.error(err);
    el.statusLine.textContent = err.message || "Ukjent feil.";
  } finally {
    hideLoading();
  }
}

window.addEventListener("DOMContentLoaded", init);