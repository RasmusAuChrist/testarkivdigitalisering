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
};

function showLoading() { if (el.loading) el.loading.style.display = "flex"; }
function hideLoading() { if (el.loading) el.loading.style.display = "none"; }

let chart;

async function fetchHistory(arkivSk) {
  const res = await fetch(`${API_BASE}/api/arkiv/${encodeURIComponent(arkivSk)}/requisition-history`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.error || `API error ${res.status}`);
  return data;
}

function buildChart(points) {
  const labels = points.map(p => p.date); // ISO yyyy-mm-dd
  const internal = points.map(p => Number(p.internal || 0));
  const ap = points.map(p => Number(p.ap || 0));

  if (chart) chart.destroy();

  chart = new Chart(el.canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Rekvisisjoner (Intern)",
          data: internal,
          borderColor: "#0f172a",
          backgroundColor: "rgba(15, 23, 42, 0.12)",
          tension: 0.25,
          pointRadius: 2,
          pointHoverRadius: 4,
        },
        {
          label: "Rekvisisjoner (AP)",
          data: ap,
          borderColor: "#f59e0b",
          backgroundColor: "rgba(245, 158, 11, 0.18)",
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
        tooltip: { enabled: true },
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
}

async function init() {
  const arkivSk = getUrlParam("arkiv_sk");
  const ident = getUrlParam("ident");

  el.subTitle.textContent = ident
    ? `Identifikator: ${ident} (arkiv_sk=${arkivSk})`
    : `arkiv_sk=${arkivSk}`;

  el.backBtn?.addEventListener("click", () => history.back());

  if (!arkivSk) {
    el.statusLine.textContent = "Mangler arkiv_sk i URL.";
    return;
  }

  showLoading();
  try {
    el.statusLine.textContent = "Laster data…";
    const data = await fetchHistory(arkivSk);
    const points = data.points || [];

    if (!points.length) {
      el.statusLine.textContent = "Ingen historikk funnet (ingen rader i tabellen).";
      buildChart([{ date: "—", internal: 0, ap: 0 }]);
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