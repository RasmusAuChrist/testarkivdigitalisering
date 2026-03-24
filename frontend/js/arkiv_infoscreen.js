const API_BASE =
  "https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net";

const REFRESH_MS = 5 * 60 * 1000;
const ROTATE_MS = 12 * 1000;
const SPOTLIGHT_POOL_SIZE = 12;

const el = {
  clockPill: document.getElementById("clockPill"),
  refreshPill: document.getElementById("refreshPill"),
  loadingOverlay: document.getElementById("loadingOverlay"),

  kpiArkiver: document.getElementById("kpiArkiver"),
  kpiDigitized: document.getElementById("kpiDigitized"),
  kpiMedia: document.getElementById("kpiMedia"),
  kpiDigark: document.getElementById("kpiDigark"),
  kpiReqInternal: document.getElementById("kpiReqInternal"),
  kpiReqAp: document.getElementById("kpiReqAp"),

  spotlightIdent: document.getElementById("spotlightIdent"),
  spotlightName: document.getElementById("spotlightName"),
  spotlightMeta: document.getElementById("spotlightMeta"),
  spotMedia: document.getElementById("spotMedia"),
  spotDigark: document.getElementById("spotDigark"),
  spotReqInternal: document.getElementById("spotReqInternal"),
  spotReqAp: document.getElementById("spotReqAp"),
  spotDigitized: document.getElementById("spotDigitized"),
  spotProgressBar: document.getElementById("spotProgressBar"),

  topRequisitionTicker: document.getElementById("topRequisitionTicker"),

  topMediaChart: document.getElementById("topMediaChart"),
  locationChart: document.getElementById("locationChart"),
  digitizationBucketChart: document.getElementById("digitizationBucketChart"),
  spotlightTrendChart: document.getElementById("spotlightTrendChart"),
};

const state = {
  rows: [],
  spotlightPool: [],
  spotlightIndex: 0,
  charts: {
    topMedia: null,
    location: null,
    digitization: null,
    spotlightTrend: null,
  },
  timers: {
    clock: null,
    refresh: null,
    rotate: null,
  },
};

function showLoading() {
  el.loadingOverlay?.classList.add("show");
}

function hideLoading() {
  el.loadingOverlay?.classList.remove("show");
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function int(v) {
  return Math.round(toNum(v)).toLocaleString("no-NO");
}

function pct(v, digits = 1) {
  return `${toNum(v).toFixed(digits)}%`;
}

function safeText(v) {
  return String(v ?? "").trim();
}

function formatTime(date = new Date()) {
  return new Intl.DateTimeFormat("no-NO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function shortLabel(value, max = 26) {
  const s = safeText(value);
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function updateClock() {
  if (el.clockPill) {
    el.clockPill.textContent = formatTime(new Date());
  }
}

function setRefreshLabel(text) {
  if (el.refreshPill) {
    el.refreshPill.textContent = text;
  }
}

async function fetchOverview() {
  const res = await fetch(`${API_BASE}/api/arkiv-overview`, {
    cache: "no-store",
  });
  const data = await res.json().catch(() => ([]));

  if (!res.ok) {
    const message = data?.error || `API error ${res.status}`;
    throw new Error(message);
  }

  if (!Array.isArray(data)) {
    throw new Error("Uventet svar fra arkiv-overview.");
  }

  return data.map(normalizeRow);
}

async function fetchViewsHistory(arkivSk) {
  const res = await fetch(
    `${API_BASE}/api/arkiv/${encodeURIComponent(arkivSk)}/dastats-views-history`,
    { cache: "no-store" }
  );
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.detail || data?.error || `API error ${res.status}`);
  }

  return Array.isArray(data?.points) ? data.points : [];
}

function normalizeRow(row) {
  const digitized = toNum(row.percentage_digitized) * 100;
  const reqInternal = toNum(row.requisitions_internal);
  const reqAp = toNum(row.requisitions_ap);

  return {
    ...row,
    navn: safeText(row.navn),
    lokasjon: safeText(row.lokasjon),
    identifikator: safeText(row.identifikator),
    tags: safeText(row.tags),
    serier: safeText(row.serier),

    percentage_digitized: digitized,
    stykke_count: toNum(row.stykke_count),
    views_internal: toNum(row.views_internal),
    views_media: toNum(row.views_media),
    views_digark: toNum(row.views_digark),
    topdesk_references: toNum(row.topdesk_references),
    average_views_media: toNum(row.average_views_media),
    average_views_digark: toNum(row.average_views_digark),
    requisitions_internal: reqInternal,
    requisitions_ap: reqAp,
    total_requisitions: reqInternal + reqAp,
  };
}

function computeSummary(rows) {
  const count = rows.length;
  const totalDigitized = rows.reduce((sum, r) => sum + r.percentage_digitized, 0);
  const totalMedia = rows.reduce((sum, r) => sum + r.views_media, 0);
  const totalDigark = rows.reduce((sum, r) => sum + r.views_digark, 0);
  const totalReqInternal = rows.reduce((sum, r) => sum + r.requisitions_internal, 0);
  const totalReqAp = rows.reduce((sum, r) => sum + r.requisitions_ap, 0);

  return {
    count,
    avgDigitized: count ? totalDigitized / count : 0,
    totalMedia,
    totalDigark,
    totalReqInternal,
    totalReqAp,
  };
}

function renderKpis(rows) {
  const s = computeSummary(rows);

  el.kpiArkiver.textContent = int(s.count);
  el.kpiDigitized.textContent = pct(s.avgDigitized, 1);
  el.kpiMedia.textContent = int(s.totalMedia);
  el.kpiDigark.textContent = int(s.totalDigark);
  el.kpiReqInternal.textContent = int(s.totalReqInternal);
  el.kpiReqAp.textContent = int(s.totalReqAp);
}

function destroyChart(chart) {
  if (chart && typeof chart.destroy === "function") {
    chart.destroy();
  }
}

function buildTopMediaChart(rows) {
  const sorted = [...rows]
    .sort((a, b) => b.views_media - a.views_media)
    .slice(0, 10);

  // Reverse so the largest appears at the TOP visually
  const labels = sorted
    .map(r => shortLabel(r.navn || r.identifikator || `arkiv ${r.arkiv_sk}`, 32))
    .reverse();

  const values = sorted
    .map(r => r.views_media)
    .reverse();

  destroyChart(state.charts.topMedia);

  state.charts.topMedia = new Chart(el.topMediaChart, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Media-visninger",
          data: values,
          borderRadius: 8,
          backgroundColor: [
            "#fae6a6",
            "#f8df95",
            "#f5d885",
            "#f2d175",
            "#eecb68",
            "#e8c45d",
            "#e2bd52",
            "#dbb447",
            "#d4ac3d",
            "#cda434"
          ]
        }
      ]
    },
    options: {
      indexAxis: "y", // keep horizontal
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${int(ctx.raw)} visninger`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: "#c8d4ea" },
          grid: { color: "rgba(255,255,255,0.08)" },
          beginAtZero: true
        },
        y: {
          ticks: { color: "#e5eefc" },
          grid: { display: false }
        }
      }
    }
  });
}

function groupByLocation(rows) {
  const map = new Map();

  for (const row of rows) {
    const key = row.lokasjon || "Ukjent";
    const existing = map.get(key) || { count: 0, viewsMedia: 0 };
    existing.count += 1;
    existing.viewsMedia += row.views_media;
    map.set(key, existing);
  }

  return [...map.entries()]
    .map(([name, values]) => ({ name, ...values }))
    .sort((a, b) => b.viewsMedia - a.viewsMedia)
    .slice(0, 10);
}

function buildLocationChart(rows) {
  const grouped = groupByLocation(rows);

  destroyChart(state.charts.location);

  state.charts.location = new Chart(el.locationChart, {
    type: "bar",
    data: {
      labels: grouped.map(x => shortLabel(x.name, 20)),
      datasets: [
        {
          label: "Media-visninger",
          data: grouped.map(x => x.viewsMedia),
          backgroundColor: "rgba(76, 201, 240, 0.75)",
          borderColor: "#4cc9f0",
          borderWidth: 1,
          yAxisID: "y",
          borderRadius: 8,
        },
        {
          label: "Antall arkiver",
          data: grouped.map(x => x.count),
          backgroundColor: "rgba(245, 197, 66, 0.75)",
          borderColor: "#f5c542",
          borderWidth: 1,
          yAxisID: "y1",
          borderRadius: 8,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600 },
      plugins: {
        legend: {
          labels: { color: "#e5eefc" }
        }
      },
      scales: {
        x: {
          ticks: { color: "#e5eefc" },
          grid: { display: false }
        },
        y: {
          position: "left",
          beginAtZero: true,
          ticks: { color: "#c8d4ea" },
          grid: { color: "rgba(255,255,255,0.08)" }
        },
        y1: {
          position: "right",
          beginAtZero: true,
          ticks: { color: "#f5d98a", precision: 0 },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });
}

function buildDigitizationBucketChart(rows) {
  const buckets = [
    { label: "0–25%", count: 0 },
    { label: "25–50%", count: 0 },
    { label: "50–75%", count: 0 },
    { label: "75–100%", count: 0 },
  ];

  for (const row of rows) {
    const p = row.percentage_digitized;
    if (p < 25) buckets[0].count += 1;
    else if (p < 50) buckets[1].count += 1;
    else if (p < 75) buckets[2].count += 1;
    else buckets[3].count += 1;
  }

  destroyChart(state.charts.digitization);

  state.charts.digitization = new Chart(el.digitizationBucketChart, {
    type: "doughnut",
    data: {
      labels: buckets.map(b => b.label),
      datasets: [
        {
          data: buckets.map(b => b.count),
          backgroundColor: ["#ef4444", "#f59e0b", "#4cc9f0", "#22c55e"],
          borderColor: "rgba(8,16,24,0.9)",
          borderWidth: 3,
          hoverOffset: 4,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600 },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#e5eefc",
            boxWidth: 14
          }
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${int(ctx.raw)} arkiver`
          }
        }
      }
    }
  });
}

function buildTopRequisitionTicker(rows) {
  const top = [...rows]
    .sort((a, b) => b.total_requisitions - a.total_requisitions)
    .slice(0, 7);

  el.topRequisitionTicker.innerHTML = top.map((row, idx) => {
    const name = shortLabel(row.navn || row.identifikator || `arkiv ${row.arkiv_sk}`, 30);
    return `
      <div class="ticker-row">
        <div class="ticker-rank">${idx + 1}</div>
        <div class="ticker-name" title="${escapeHtml(row.navn)}">${escapeHtml(name)}</div>
        <div class="ticker-value">${int(row.total_requisitions)}</div>
      </div>
    `;
  }).join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildSpotlightPool(rows) {
  state.spotlightPool = [...rows]
    .sort((a, b) => {
      const scoreA = a.views_media * 0.7 + a.views_digark * 0.25 + a.total_requisitions * 2;
      const scoreB = b.views_media * 0.7 + b.views_digark * 0.25 + b.total_requisitions * 2;
      return scoreB - scoreA;
    })
    .slice(0, SPOTLIGHT_POOL_SIZE);

  state.spotlightIndex = 0;
}

function formatSpotlightMeta(row) {
  const parts = [];
  if (row.lokasjon) parts.push(row.lokasjon);
  if (row.stykke_count) parts.push(`${int(row.stykke_count)} stykker`);
  if (row.tags) parts.push(shortLabel(row.tags, 40));
  return parts.join(" • ");
}

async function renderSpotlightAt(index) {
  if (!state.spotlightPool.length) return;

  const row = state.spotlightPool[index % state.spotlightPool.length];

  el.spotlightIdent.textContent = row.identifikator || `arkiv_sk=${row.arkiv_sk}`;
  el.spotlightName.textContent = row.navn || "Uten navn";
  el.spotlightMeta.textContent = formatSpotlightMeta(row) || "Ingen ekstra metadata";
  el.spotMedia.textContent = int(row.views_media);
  el.spotDigark.textContent = int(row.views_digark);
  el.spotReqInternal.textContent = int(row.requisitions_internal);
  el.spotReqAp.textContent = int(row.requisitions_ap);
  el.spotDigitized.textContent = pct(row.percentage_digitized, 1);
  el.spotProgressBar.style.width = `${Math.max(0, Math.min(100, row.percentage_digitized))}%`;

  try {
    const points = await fetchViewsHistory(row.arkiv_sk);
    buildSpotlightTrendChart(points, row);
  } catch (err) {
    console.error("Kunne ikke hente spotlight-visningshistorikk:", err);
    buildSpotlightTrendChart([], row);
  }
}

function buildSpotlightTrendChart(points, row) {
  const labels = points.map(p => formatMonthLabel(p.date));
  const media = points.map(p => toNum(p.media));
  const digark = points.map(p => toNum(p.digark));

  destroyChart(state.charts.spotlightTrend);

  state.charts.spotlightTrend = new Chart(el.spotlightTrendChart, {
    type: "line",
    data: {
      labels: labels.length ? labels : ["Ingen data"],
      datasets: [
        {
          label: "Media",
          data: labels.length ? media : [0],
          borderColor: "#4cc9f0",
          backgroundColor: "rgba(76, 201, 240, 0.18)",
          tension: 0.25,
          fill: false,
          pointRadius: 2,
        },
        {
          label: "Digark",
          data: labels.length ? digark : [0],
          borderColor: "#f5c542",
          backgroundColor: "rgba(245, 197, 66, 0.18)",
          tension: 0.25,
          fill: false,
          pointRadius: 2,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500 },
      interaction: { mode: "index", intersect: false },
      plugins: {
        title: {
          display: true,
          text: `Visningsutvikling – ${row.identifikator || row.arkiv_sk}`,
          color: "#e5eefc",
          font: { size: 14, weight: "700" },
          padding: { bottom: 10 }
        },
        legend: {
          labels: { color: "#e5eefc" }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${int(ctx.raw)}`
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: "#c8d4ea",
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 8
          },
          grid: { display: false }
        },
        y: {
          beginAtZero: true,
          ticks: { color: "#c8d4ea", precision: 0 },
          grid: { color: "rgba(255,255,255,0.08)" }
        }
      }
    }
  });
}

function formatMonthLabel(isoDate) {
  const d = new Date(`${isoDate}T00:00:00`);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}/${yy}`;
}

function clearIntervals() {
  for (const timer of Object.values(state.timers)) {
    if (timer) clearInterval(timer);
  }
}

function startTimers() {
  clearIntervals();

  updateClock();
  state.timers.clock = setInterval(updateClock, 30 * 1000);

  state.timers.refresh = setInterval(async () => {
    await loadDashboard();
  }, REFRESH_MS);

  state.timers.rotate = setInterval(async () => {
    if (!state.spotlightPool.length) return;
    state.spotlightIndex = (state.spotlightIndex + 1) % state.spotlightPool.length;
    await renderSpotlightAt(state.spotlightIndex);
  }, ROTATE_MS);
}

async function loadDashboard() {
  showLoading();
  setRefreshLabel("Oppdaterer data…");

  try {
    const rows = await fetchOverview();
    state.rows = rows;

    renderKpis(rows);
    buildTopMediaChart(rows);
    buildLocationChart(rows);
    buildDigitizationBucketChart(rows);
    buildTopRequisitionTicker(rows);

    buildSpotlightPool(rows);
    await renderSpotlightAt(state.spotlightIndex);

    setRefreshLabel(`Sist oppdatert ${formatTime(new Date())}`);
  } catch (err) {
    console.error(err);
    setRefreshLabel(`Feil ved oppdatering: ${err.message}`);
  } finally {
    hideLoading();
  }
}

async function init() {
  await loadDashboard();
  startTimers();
}

window.addEventListener("DOMContentLoaded", init);
window.addEventListener("beforeunload", clearIntervals);