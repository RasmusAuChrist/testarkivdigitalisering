const API_BASE =
  "https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net";

function getUrlParam(name) {
  const v = new URLSearchParams(window.location.search).get(name);
  return v ? v.trim() : "";
}

const el = {
  subTitle: document.getElementById("subTitle"),
  backBtn: document.getElementById("backBtn"),
  statusLine: document.getElementById("statusLine"),
  canvas: document.getElementById("reqChart"),
  loading: document.getElementById("loadingOverlay"),

  toggleInternal: document.getElementById("toggleInternal"),
  toggleAp: document.getElementById("toggleAp"),
  toggleTotal: document.getElementById("toggleTotal"),
};

function showLoading() { if (el.loading) el.loading.style.display = "flex"; }
function hideLoading() { if (el.loading) el.loading.style.display = "none"; }

let chart;

async function fetchHistory(arkivSk) {
  const res = await fetch(
    `${API_BASE}/api/arkiv/${encodeURIComponent(arkivSk)}/requisition-history`
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.error || `API error ${res.status}`);
  return data;
}

function formatMMYYYY(isoDate) {
  // isoDate expected: "YYYY-MM-DD"
  const d = new Date(isoDate + "T00:00:00");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${mm} ${yyyy}`;
}

function wireToggles() {
  const apply = () => {
    if (!chart) return;

    // dataset order: 0=internal, 1=ap, 2=total
    chart.setDatasetVisibility(0, !!el.toggleInternal?.checked);
    chart.setDatasetVisibility(1, !!el.toggleAp?.checked);
    chart.setDatasetVisibility(2, !!el.toggleTotal?.checked);
    chart.update();
  };

  el.toggleInternal?.addEventListener("change", apply);
  el.toggleAp?.addEventListener("change", apply);
  el.toggleTotal?.addEventListener("change", apply);

  return apply;
}

function buildChart(points) {
  // raw dates for tooltips
  const rawDates = points.map(p => p.date); // "YYYY-MM-DD"
  const labels = rawDates.map(formatMMYYYY);

  const internal = points.map(p => Number(p.internal || 0));
  const ap = points.map(p => Number(p.ap || 0));
  const total = internal.map((v, i) => v + ap[i]);

  if (chart) chart.destroy();

  chart = new Chart(el.canvas, {
    type: "line",
    data: {
      labels, // MM YYYY
      datasets: [
        {
          label: "Intern",
          data: internal,
          borderColor: "#0f172a",
          backgroundColor: "rgba(15, 23, 42, 0.10)",
          tension: 0.25,
          pointRadius: 2,
          pointHoverRadius: 4,
        },
        {
          label: "AP",
          data: ap,
          borderColor: "#f59e0b",
          backgroundColor: "rgba(245, 158, 11, 0.14)",
          tension: 0.25,
          pointRadius: 2,
          pointHoverRadius: 4,
        },
        {
          label: "Total",
          data: total,
          borderColor: "#10b981",
          backgroundColor: "rgba(16, 185, 129, 0.14)",
          borderDash: [6, 4], // visually distinct
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
        legend: {
          position: "top",
          // Legend click already toggles visibility by default in Chart.js.
          // We sync checkboxes after legend click:
          onClick: (e, legendItem, legend) => {
            const index = legendItem.datasetIndex;
            legend.chart.toggleDataVisibility(index);
            legend.chart.update();

            // sync checkboxes to current visibility
            const vis = legend.chart.getDataVisibility(index);
            if (index === 0 && el.toggleInternal) el.toggleInternal.checked = vis;
            if (index === 1 && el.toggleAp) el.toggleAp.checked = vis;
            if (index === 2 && el.toggleTotal) el.toggleTotal.checked = vis;
          }
        },
        tooltip: {
          callbacks: {
            // Show the real month key in tooltip as "MM YYYY" (already), but also include full ISO if you want:
            title: (items) => {
              const idx = items?.[0]?.dataIndex ?? 0;
              return `${formatMMYYYY(rawDates[idx])}`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 12,
          }
        },
        y: {
          beginAtZero: true,
          ticks: { precision: 0 },
        },
      },
    },
  });

  // Apply initial toggle state (checkboxes)
  const applyToggles = wireToggles();
  if (applyToggles) applyToggles();
}

async function init() {
  const arkivSk = getUrlParam("arkiv_sk");
  const ident = getUrlParam("ident");
  const kind = getUrlParam("kind"); // "internal" or "ap" (optional)

  el.subTitle.textContent = ident
    ? `Identifikator: ${ident} (arkiv_sk=${arkivSk})`
    : `arkiv_sk=${arkivSk}`;

  el.backBtn?.addEventListener("click", () => history.back());

  if (!arkivSk) {
    el.statusLine.textContent = "Mangler arkiv_sk i URL.";
    return;
  }

  // Optional: if link came from a specific kind, default-hide the other line
  if (kind === "internal") {
    if (el.toggleAp) el.toggleAp.checked = false;
  } else if (kind === "ap") {
    if (el.toggleInternal) el.toggleInternal.checked = false;
  }

  showLoading();
  try {
    el.statusLine.textContent = "Laster data…";
    const data = await fetchHistory(arkivSk);
    const points = data.points || [];

    if (!points.length) {
      el.statusLine.textContent = "Ingen historikk funnet (ingen rader i tabellen).";
      buildChart([{ date: "2000-01-01", internal: 0, ap: 0 }]);
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