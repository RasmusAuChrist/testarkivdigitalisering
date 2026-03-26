const API_BASE =
  "https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net";

const REFRESH_MS = 5 * 60 * 1000;
const ROTATE_MS = 12 * 1000;

const TOP_REQUISITION_COUNT = 50;
const TOP_REQUISITION_VISIBLE = 7;
const TOP_REQUISITION_SCROLL_MS = 5000;

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
  spotlightIndex: 0,
  currentSpotlightArkivSk: null,
  topRequisitionRows: [],
  topRequisitionOffset: 0,
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
    requisitionScroll: null,
  },
  cache: {
    viewsHistory: new Map(),
    requisitionHistory: new Map(),
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
  if (state.cache.viewsHistory.has(arkivSk)) {
    return state.cache.viewsHistory.get(arkivSk);
  }

  const res = await fetch(
    `${API_BASE}/api/arkiv/${encodeURIComponent(arkivSk)}/dastats-views-history`,
    { cache: "no-store" }
  );
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.detail || data?.error || `API error ${res.status}`);
  }

  const points = Array.isArray(data?.points) ? data.points : [];
  state.cache.viewsHistory.set(arkivSk, points);
  return points;
}

async function fetchRequisitionHistory(arkivSk) {
  if (state.cache.requisitionHistory.has(arkivSk)) {
    return state.cache.requisitionHistory.get(arkivSk);
  }

  const res = await fetch(
    `${API_BASE}/api/arkiv/${encodeURIComponent(arkivSk)}/requisition-history`,
    { cache: "no-store" }
  );
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.detail || data?.error || `API error ${res.status}`);
  }

  const points = Array.isArray(data?.points) ? data.points : [];
  state.cache.requisitionHistory.set(arkivSk, points);
  return points;
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
      indexAxis: "y",
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
          reverse: true,
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
  state.topRequisitionRows = [...rows]
    .sort((a, b) => b.total_requisitions - a.total_requisitions)
    .slice(0, TOP_REQUISITION_COUNT);

  state.topRequisitionOffset = 0;
  renderTopRequisitionTickerWindow();
}

function renderTopRequisitionTickerWindow() {
  const allRows = state.topRequisitionRows;
  const visibleCount = Math.min(TOP_REQUISITION_VISIBLE, allRows.length);

  if (!allRows.length) {
    el.topRequisitionTicker.innerHTML = `
      <div class="ticker-row">
        <div class="ticker-name">Ingen data</div>
      </div>
    `;
    return;
  }

  const visibleRows = [];
  for (let i = 0; i < visibleCount; i += 1) {
    const idx = (state.topRequisitionOffset + i) % allRows.length;
    visibleRows.push({
      row: allRows[idx],
      rank: idx + 1,
    });
  }

  el.topRequisitionTicker.innerHTML = visibleRows.map(({ row, rank }) => {
    const displayName = shortLabel(
      row.navn || row.identifikator || `arkiv ${row.arkiv_sk}`,
      30
    );

    return `
      <div class="ticker-row">
        <div class="ticker-rank">${rank}</div>
        <div class="ticker-name" title="${escapeHtml(row.navn || row.identifikator || "")}">
          ${escapeHtml(displayName)}
        </div>
        <div class="ticker-value">${int(row.total_requisitions)}</div>
      </div>
    `;
  }).join("");
}

function startTopRequisitionScroll() {
  if (state.timers.requisitionScroll) {
    clearInterval(state.timers.requisitionScroll);
    state.timers.requisitionScroll = null;
  }

  if (state.topRequisitionRows.length <= TOP_REQUISITION_VISIBLE) {
    return;
  }

  state.timers.requisitionScroll = setInterval(() => {
    state.topRequisitionOffset =
      (state.topRequisitionOffset + 1) % state.topRequisitionRows.length;

    renderTopRequisitionTickerWindow();
  }, TOP_REQUISITION_SCROLL_MS);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatSpotlightMeta(row) {
  const parts = [];
  if (row.lokasjon) parts.push(row.lokasjon);
  if (row.stykke_count) parts.push(`${int(row.stykke_count)} stykker`);
  if (row.tags) parts.push(shortLabel(row.tags, 40));
  return parts.join(" • ");
}

function getRandomInt(max) {
  return Math.floor(Math.random() * max);
}

function getRandomArrayItem(items) {
  if (!items.length) return null;
  return items[getRandomInt(items.length)];
}

function pickRandomSpotlightRow() {
  if (!state.rows.length) return null;
  if (state.rows.length === 1) return state.rows[0];

  let candidate = null;
  let attempts = 0;

  while (attempts < 10) {
    candidate = getRandomArrayItem(state.rows);
    if (candidate && candidate.arkiv_sk !== state.currentSpotlightArkivSk) {
      return candidate;
    }
    attempts += 1;
  }

  return candidate || state.rows[0];
}

function pickRandomSpotlightMode() {
  return Math.random() < 0.5 ? "views" : "orders";
}

function buildSpotlightOrdersChart(points, row) {
  const labels = points.map(p => formatMonthLabel(p.date));
  const internal = points.map(p => toNum(p.internal));
  const ap = points.map(p => toNum(p.ap));

  destroyChart(state.charts.spotlightTrend);

  state.charts.spotlightTrend = new Chart(el.spotlightTrendChart, {
    type: "line",
    data: {
      labels: labels.length ? labels : ["Ingen data"],
      datasets: [
        {
          label: "Intern",
          data: labels.length ? internal : [0],
          borderColor: "#4cc9f0",
          backgroundColor: "rgba(76, 201, 240, 0.18)",
          tension: 0.25,
          fill: false,
          pointRadius: 2,
        },
        {
          label: "AP",
          data: labels.length ? ap : [0],
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
          text: `Rekvisisjonsutvikling – ${row.identifikator || row.arkiv_sk}`,
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

function buildSpotlightOrdersChart(points, row) {
  const labels = points.map(p => formatMonthLabel(p.date));
  const internal = points.map(p => toNum(p.internal));
  const ap = points.map(p => toNum(p.ap));
  const total = points.map((_, index) => internal[index] + ap[index]);

  destroyChart(state.charts.spotlightTrend);

  state.charts.spotlightTrend = new Chart(el.spotlightTrendChart, {
    type: "line",
    data: {
      labels: labels.length ? labels : ["Ingen data"],
      datasets: [
        {
          label: "Intern",
          data: labels.length ? internal : [0],
          borderColor: "#4cc9f0",
          backgroundColor: "rgba(76, 201, 240, 0.18)",
          tension: 0.25,
          fill: false,
          pointRadius: 2,
        },
        {
          label: "AP",
          data: labels.length ? ap : [0],
          borderColor: "#f5c542",
          backgroundColor: "rgba(245, 197, 66, 0.18)",
          tension: 0.25,
          fill: false,
          pointRadius: 2,
        },
        {
          label: "Total",
          data: labels.length ? total : [0],
          borderColor: "#22c55e",
          backgroundColor: "rgba(34, 197, 94, 0.16)",
          tension: 0.25,
          fill: false,
          pointRadius: 2,
          borderDash: [6, 5],
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
          text: `Rekvisisjonsutvikling – ${row.identifikator || row.arkiv_sk}`,
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

async function renderRandomSpotlight() {
  const row = pickRandomSpotlightRow();
  if (!row) return;

  state.currentSpotlightArkivSk = row.arkiv_sk;

  el.spotlightIdent.textContent = row.identifikator || `arkiv_sk=${row.arkiv_sk}`;
  el.spotlightName.textContent = row.navn || "Uten navn";
  el.spotlightMeta.textContent = formatSpotlightMeta(row) || "Ingen ekstra metadata";
  el.spotMedia.textContent = int(row.views_media);
  el.spotDigark.textContent = int(row.views_digark);
  el.spotReqInternal.textContent = int(row.requisitions_internal);
  el.spotReqAp.textContent = int(row.requisitions_ap);
  el.spotDigitized.textContent = pct(row.percentage_digitized, 1);
  el.spotProgressBar.style.width = `${Math.max(0, Math.min(100, row.percentage_digitized))}%`;

  const mode = pickRandomSpotlightMode();

  try {
    if (mode === "orders") {
      const points = await fetchRequisitionHistory(row.arkiv_sk);
      buildSpotlightOrdersChart(points, row);
    } else {
      const points = await fetchViewsHistory(row.arkiv_sk);
      buildSpotlightViewsChart(points, row);
    }
  } catch (err) {
    console.error("Kunne ikke hente spotlight-historikk:", err);
    if (mode === "orders") {
      buildSpotlightOrdersChart([], row);
    } else {
      buildSpotlightViewsChart([], row);
    }
  }
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
    await renderRandomSpotlight();
  }, ROTATE_MS);

  startTopRequisitionScroll();
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

    await renderRandomSpotlight();

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