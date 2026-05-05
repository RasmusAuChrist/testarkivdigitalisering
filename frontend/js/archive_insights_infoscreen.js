const API_BASE =
  "https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net";

const REFRESH_MS = 15 * 60 * 1000;

const el = {
  clockPill: document.getElementById("clockPill"),
  refreshPill: document.getElementById("refreshPill"),
  loadingOverlay: document.getElementById("loadingOverlay"),

  kpiArchives: document.getElementById("kpiArchives"),
  kpiAdjustedViews: document.getElementById("kpiAdjustedViews"),
  kpiArchivesWithViews: document.getElementById("kpiArchivesWithViews"),
  kpiAvgDigitized: document.getElementById("kpiAvgDigitized"),
  kpiRequisitions: document.getElementById("kpiRequisitions"),

  topArchiveList: document.getElementById("topArchiveList"),

  concentrationChart: document.getElementById("concentrationChart"),
  digitizationScatterChart: document.getElementById("digitizationScatterChart"),
  monthlyTrendChart: document.getElementById("monthlyTrendChart"),
};

const charts = {
  concentration: null,
  scatter: null,
  monthly: null,
};

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function int(v) {
  return Math.round(toNum(v)).toLocaleString("no-NO");
}

function compact(v) {
  return Intl.NumberFormat("no-NO", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(toNum(v));
}

function pct(v, digits = 1) {
  return `${(toNum(v) * 100).toFixed(digits)} %`;
}

function shortText(value, max = 48) {
  const s = String(value ?? "").trim();
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTime(date = new Date()) {
  return new Intl.DateTimeFormat("no-NO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function monthKeyToLabel(monthKey) {
  const s = String(monthKey);
  if (s.length < 6) return s;
  const year = s.slice(0, 4);
  const month = s.slice(4, 6);
  return `${month}.${year}`;
}

function updateClock() {
  el.clockPill.textContent = formatTime(new Date());
}

function showLoading() {
  el.loadingOverlay?.classList.add("show");
}

function hideLoading() {
  el.loadingOverlay?.classList.remove("show");
}

function destroyChart(chart) {
  if (chart && typeof chart.destroy === "function") chart.destroy();
}

async function fetchJson(path) {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || data?.error || `API error ${res.status}`);
  return data;
}

async function fetchAll() {
  const [
    summary,
    topArchives,
    concentration,
    scatter,
    monthlyTrend,
  ] = await Promise.all([
    fetchJson("/api/archive-insights/summary"),
    fetchJson("/api/archive-insights/top?limit=25"),
    fetchJson("/api/archive-insights/concentration"),
    fetchJson("/api/archive-insights/digitization-scatter?limit=5000"),
    fetchJson("/api/archive-insights/monthly-trend"),
  ]);

  return {
    summary,
    topArchives: Array.isArray(topArchives) ? topArchives : [],
    concentration: Array.isArray(concentration) ? concentration : [],
    scatter: Array.isArray(scatter) ? scatter : [],
    monthlyTrend: Array.isArray(monthlyTrend) ? monthlyTrend : [],
  };
}

function renderKpis(summary) {
  el.kpiArchives.textContent = int(summary.archives);
  el.kpiAdjustedViews.textContent = compact(summary.total_adjusted_views);
  el.kpiArchivesWithViews.textContent = int(summary.archives_with_views);
  el.kpiAvgDigitized.textContent = pct(summary.avg_digitized);
  el.kpiRequisitions.textContent = int(summary.total_requisitions);
}

function renderTopArchiveList(rows) {
  const top = rows.slice(0, 12);

  if (!top.length) {
    el.topArchiveList.innerHTML = `<div class="top-row">Ingen data</div>`;
    return;
  }

  el.topArchiveList.innerHTML = top.map((r, i) => {
    const title = r.navn || r.identifikator || `Arkiv ${r.arkiv_sk}`;
    const meta = [
      r.identifikator || "uten identifikator",
      `${pct(r.percentage_digitized)} digitalisert`,
      `${int(r.total_requisitions)} bestillinger`
    ].join(" • ");

    return `
      <div class="top-row" title="${escapeHtml(title)}">
        <div class="rank">${i + 1}</div>
        <div>
          <div class="row-name">${escapeHtml(shortText(title, 52))}</div>
          <div class="row-meta">${escapeHtml(meta)}</div>
        </div>
        <div class="row-value">${compact(r.total_adjusted_views)}</div>
      </div>
    `;
  }).join("");
}

function pickConcentrationBars(rows) {
  const targets = [0.01, 0.05, 0.10];
  return targets.map(target => {
    const closest = rows.reduce((best, r) => {
      const diff = Math.abs(toNum(r.archive_share) - target);
      const bestDiff = Math.abs(toNum(best.archive_share) - target);
      return diff < bestDiff ? r : best;
    }, rows[0] || {});
    return {
      label: `Topp ${Math.round(target * 100)} %`,
      value: toNum(closest.cumulative_view_share),
    };
  });
}

function buildConcentrationChart(rows) {
  destroyChart(charts.concentration);

  const bars = pickConcentrationBars(rows);
  const labels = bars.map(b => b.label);
  const values = bars.map(b => b.value * 100);

  charts.concentration = new Chart(el.concentrationChart, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Andel av justerte visninger",
        data: values,
        backgroundColor: "rgba(245,197,66,0.75)",
        borderColor: "#f5c542",
        borderWidth: 1,
        borderRadius: 10,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#e5eefc" } },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.raw.toFixed(1)} % av visningene`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "#e5eefc" },
          grid: { display: false },
        },
        y: {
          min: 0,
          max: 100,
          title: { display: true, text: "Andel av visninger", color: "#c8d4ea" },
          ticks: { color: "#c8d4ea", callback: v => `${v}%` },
          grid: { color: "rgba(255,255,255,0.08)" },
        },
      },
    },
  });
}

function buildDigitizationScatter(rows) {
  destroyChart(charts.scatter);

  const points = rows
    .filter(r => toNum(r.total_adjusted_views) > 0)
    .map(r => ({
      x: toNum(r.percentage_digitized) * 100,
      y: toNum(r.total_adjusted_views),
      label: r.navn || r.identifikator || `Arkiv ${r.arkiv_sk}`,
      identifikator: r.identifikator,
      requisitions: toNum(r.total_requisitions),
    }));

  charts.scatter = new Chart(el.digitizationScatterChart, {
    type: "scatter",
    data: {
      datasets: [{
        label: "Arkiver",
        data: points,
        backgroundColor: "rgba(76,201,240,0.45)",
        borderColor: "#4cc9f0",
        borderWidth: 1,
        pointRadius: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: items => shortText(items[0].raw.label, 80),
            label: ctx => {
              const p = ctx.raw;
              return [
                `Digitalisert: ${p.x.toFixed(1)} %`,
                `Justerte visninger: ${int(p.y)}`,
                `Fysiske bestillinger: ${int(p.requisitions)}`,
              ];
            },
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: "Digitaliseringsgrad", color: "#c8d4ea" },
          min: 0,
          max: 100,
          ticks: { color: "#c8d4ea", callback: v => `${v}%` },
          grid: { color: "rgba(255,255,255,0.08)" },
        },
        y: {
          type: "logarithmic",
          title: { display: true, text: "Justerte visninger", color: "#c8d4ea" },
          min: 1,
          ticks: { color: "#c8d4ea" },
          grid: { color: "rgba(255,255,255,0.08)" },
        },
      },
    },
  });
}

function buildMonthlyTrend(rows) {
  destroyChart(charts.monthly);

  const sorted = [...rows].sort((a, b) => toNum(a.month_key) - toNum(b.month_key));
  const labels = sorted.map(r => monthKeyToLabel(r.month_key));

  charts.monthly = new Chart(el.monthlyTrendChart, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Rå visninger",
          data: sorted.map(r => toNum(r.raw_views)),
          borderColor: "rgba(239,68,68,0.9)",
          backgroundColor: "rgba(239,68,68,0.12)",
          tension: 0.22,
          pointRadius: 0,
        },
        {
          label: "Kappede visninger",
          data: sorted.map(r => toNum(r.capped_views)),
          borderColor: "rgba(245,158,11,0.9)",
          backgroundColor: "rgba(245,158,11,0.12)",
          tension: 0.22,
          pointRadius: 0,
        },
        {
          label: "Justerte visninger",
          data: sorted.map(r => toNum(r.adjusted_views)),
          borderColor: "rgba(34,197,94,0.95)",
          backgroundColor: "rgba(34,197,94,0.12)",
          tension: 0.22,
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: "#e5eefc" } },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${int(ctx.raw)}`,
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#e5eefc",
            maxTicksLimit: 7,
          },
          grid: { display: false },
        },
        y: {
          type: "logarithmic",
          title: { display: true, text: "Visninger", color: "#c8d4ea" },
          min: 1,
          ticks: { color: "#c8d4ea" },
          grid: { color: "rgba(255,255,255,0.08)" },
        },
      },
    },
  });
}

async function loadDashboard() {
  showLoading();
  el.refreshPill.textContent = "Oppdaterer data…";

  try {
    const data = await fetchAll();

    renderKpis(data.summary);
    renderTopArchiveList(data.topArchives);
    buildConcentrationChart(data.concentration);
    buildDigitizationScatter(data.scatter);
    buildMonthlyTrend(data.monthlyTrend);

    el.refreshPill.textContent = `Sist oppdatert ${formatTime(new Date())}`;
  } catch (err) {
    console.error(err);
    el.refreshPill.textContent = `Feil: ${err.message}`;
  } finally {
    hideLoading();
  }
}

window.addEventListener("DOMContentLoaded", () => {
  updateClock();
  setInterval(updateClock, 30 * 1000);

  loadDashboard();
  setInterval(loadDashboard, REFRESH_MS);
});