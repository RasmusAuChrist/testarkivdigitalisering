const API_BASE = "https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net";

const REFRESH_MS = 15 * 60 * 1000;

// --------------------------------------------------
// DOM
// --------------------------------------------------

const el = {
  clock: document.getElementById("clockPill"),
  refresh: document.getElementById("refreshPill"),

  kpiSeriesTotal: document.getElementById("kpiSeriesTotal"),
  kpiLowDigitized: document.getElementById("kpiLowDigitized"),
  kpiPhysicalDemand: document.getElementById("kpiPhysicalDemand"),
  kpiAdjustedViews: document.getElementById("kpiAdjustedViews"),
  kpiCandidates: document.getElementById("kpiCandidates"),

  candidateList: document.getElementById("candidateList"),

  gapChart: document.getElementById("gapScatterChart"),
  timeChart: document.getElementById("timeComparisonChart"),
  categoryChart: document.getElementById("categoryChart"),
};

// --------------------------------------------------
// Utils
// --------------------------------------------------

const toNum = (v) => Number(v) || 0;

const int = (v) =>
  Math.round(toNum(v)).toLocaleString("no-NO");

const pct = (v) =>
  `${(toNum(v) * 100).toFixed(1)} %`;

const score = (v) =>
  toNum(v).toFixed(3);

const short = (s, n = 40) =>
  s && s.length > n ? s.slice(0, n) + "…" : s;

// --------------------------------------------------
// Clock
// --------------------------------------------------

function updateClock() {
  el.clock.textContent = new Date().toLocaleString("no-NO");
}

// --------------------------------------------------
// Fetch
// --------------------------------------------------

async function fetchJson(path) {
  const res = await fetch(`${API_BASE}${path}`);
  return res.json();
}

async function loadData() {
  const [summary, candidates, time, category] = await Promise.all([
    fetchJson("/api/serie-insights/summary"),
    fetchJson("/api/serie-insights/candidates/balanced?limit=50"),
    fetchJson("/api/serie-insights/time-comparison"),
    fetchJson("/api/serie-insights/candidates/category-summary"),
  ]);

  return { summary, candidates, time, category };
}

// --------------------------------------------------
// KPI
// --------------------------------------------------

function renderKPIs(summary, candidates) {
  el.kpiSeriesTotal.textContent = int(summary.series_total);
  el.kpiLowDigitized.textContent = int(summary.low_digitized_series);
  el.kpiPhysicalDemand.textContent = int(summary.low_digitized_with_physical_demand);
  el.kpiAdjustedViews.textContent = int(summary.total_adjusted_views);
  el.kpiCandidates.textContent = int(candidates.length);
}

// --------------------------------------------------
// Candidate list
// --------------------------------------------------

function renderCandidates(rows) {
  const top = rows.slice(0, 12);

  el.candidateList.innerHTML = top.map((r, i) => {
    return `
      <div class="candidate-row">
        <div class="rank">${i + 1}</div>
        <div>
          <div class="candidate-name">${short(r.navn || "Ukjent")}</div>
          <div class="candidate-meta">
            ${Math.round(r.mid_year)} • ${pct(r.percentage_digitized)} • ${int(r.total_requisitions)} bestillinger
          </div>
        </div>
        <div class="score">${score(r.priority_balanced)}</div>
      </div>
    `;
  }).join("");
}

// --------------------------------------------------
// Scatter plot
// --------------------------------------------------

let gapChart;

function renderGap(rows) {
  if (gapChart) gapChart.destroy();

  const data = rows.map(r => ({
    x: r.percentage_digitized * 100,
    y: r.total_requisitions,
    r: Math.max(4, Math.sqrt(r.total_adjusted_views) / 200),
    label: r.navn
  }));

  gapChart = new Chart(el.gapChart, {
    type: "bubble",
    data: {
      datasets: [{
        data,
        backgroundColor: "rgba(245,197,66,0.5)"
      }]
    },
    options: {
      scales: {
        x: {
          title: { display: true, text: "Digitalisering (%)" }
        },
        y: {
          type: "logarithmic",
          title: { display: true, text: "Fysiske bestillinger" }
        }
      },
      plugins: {
        tooltip: {
          callbacks: {
            title: (ctx) => ctx[0].raw.label
          }
        }
      }
    }
  });
}

// --------------------------------------------------
// Time comparison
// --------------------------------------------------

let timeChart;

function renderTime(rows) {
  if (timeChart) timeChart.destroy();

  const labels = rows.map(r => r.time_bin);

  const digital = normalize(rows.map(r => r.views_per_digitized_equivalent));
  const physical = normalize(rows.map(r => r.requisitions_per_series));

  timeChart = new Chart(el.timeChart, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Digital",
          data: digital,
        },
        {
          label: "Fysisk",
          data: physical,
        }
      ]
    }
  });
}

// --------------------------------------------------
// Category
// --------------------------------------------------

let categoryChart;

function renderCategory(rows) {
  if (categoryChart) categoryChart.destroy();

  const top = rows.slice(0, 10);

  categoryChart = new Chart(el.categoryChart, {
    type: "bar",
    data: {
      labels: top.map(r => r.serie_category),
      datasets: [{
        data: top.map(r => r.candidates)
      }]
    }
  });
}

// --------------------------------------------------
// Normalize helper
// --------------------------------------------------

function normalize(arr) {
  const max = Math.max(...arr);
  return arr.map(v => max > 0 ? v / max : 0);
}

// --------------------------------------------------
// Main
// --------------------------------------------------

async function refresh() {
  el.refresh.textContent = "Oppdaterer…";

  const data = await loadData();

  renderKPIs(data.summary, data.candidates);
  renderCandidates(data.candidates);
  renderGap(data.candidates);
  renderTime(data.time);
  renderCategory(data.category);

  el.refresh.textContent = "Oppdatert";
}

// --------------------------------------------------
// Init
// --------------------------------------------------

window.onload = async () => {
  updateClock();
  setInterval(updateClock, 30000);

  await refresh();
  setInterval(refresh, REFRESH_MS);
};