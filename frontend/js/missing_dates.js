import { initProtectedPage, apiGet } from "./page_auth.js";

const el = {
  loadingOverlay: document.getElementById("loadingOverlay"),
  statusText: document.getElementById("statusText"),
  kpiGrid: document.getElementById("kpiGrid"),
  locationChart: document.getElementById("locationChart"),
  archiveChart: document.getElementById("archiveChart"),
  locationBars: document.getElementById("locationBars"),
  archiveBars: document.getElementById("archiveBars"),
  searchInput: document.getElementById("searchInput"),
  locationFilter: document.getElementById("locationFilter"),
  tableBody: document.getElementById("tableBody"),
};

const state = {
  rows: [],
  summary: {},
  charts: {
    locations: null,
    archives: null,
  },
};

const CHART_COLORS = [
  "#123a63",
  "#c7a13b",
  "#2f6f9f",
  "#7c8da4",
  "#8c6f2a",
  "#d7c98b",
];

function safeText(value) {
  return String(value ?? "").trim();
}

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function int(value) {
  return Math.round(toNum(value)).toLocaleString("no-NO");
}

function pct(value) {
  return `${toNum(value).toLocaleString("no-NO", {
    maximumFractionDigits: 1,
  })} %`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setLoading(isLoading) {
  if (el.loadingOverlay) {
    el.loadingOverlay.style.display = isLoading ? "flex" : "none";
  }
}

function setStatus(message, isError = false) {
  el.statusText.textContent = message || "";
  el.statusText.style.color = isError ? "#b42318" : "#667587";
}

function kpiCard(label, value, foot) {
  return `
    <article class="kpi-card">
      <div class="kpi-label">${escapeHtml(label)}</div>
      <div class="kpi-value">${escapeHtml(value)}</div>
      <div class="kpi-foot">${escapeHtml(foot)}</div>
    </article>
  `;
}

function renderKpis(summary) {
  el.kpiGrid.innerHTML = [
    kpiCard(
      "Berørte serier",
      int(summary.series_with_missing),
      `${pct(summary.affected_series_percent)} av alle serier`
    ),
    kpiCard(
      "Stykker med avvik",
      int(summary.missing_items),
      `${pct(summary.missing_items_percent)} av registrerte stykker`
    ),
    kpiCard(
      "Kjent lokasjon",
      int(summary.items_with_known_location),
      `${pct(summary.items_with_known_location_percent)} av avvikene`
    ),
    kpiCard(
      "Alle serier i Asta",
      int(summary.total_series),
      `${int(summary.total_stykker)} stykker i datagrunnlaget`
    ),
  ].join("");
}

function chartRows(rows, limit = 5) {
  const visible = (rows || []).slice(0, limit).map((row, index) => ({
    ...row,
    color: CHART_COLORS[index % CHART_COLORS.length],
  }));
  const rest = (rows || []).slice(limit);
  const restCount = rest.reduce((sum, row) => sum + toNum(row.count), 0);
  const total = (rows || []).reduce((sum, row) => sum + toNum(row.count), 0);
  if (restCount > 0) {
    visible.push({
      name: "Andre",
      count: restCount,
      percent: total ? (restCount / total) * 100 : 0,
      color: CHART_COLORS[visible.length % CHART_COLORS.length],
    });
  }
  return visible;
}

function destroyChart(key) {
  if (state.charts[key]) {
    state.charts[key].destroy();
    state.charts[key] = null;
  }
}

function renderLegend(host, rows, emptyText) {
  if (!rows?.length) {
    host.innerHTML = `<div class="empty-state">${escapeHtml(emptyText)}</div>`;
    return;
  }

  host.innerHTML = rows.map(row => {
    return `
      <div class="legend-row">
        <span class="legend-swatch" style="background:${escapeHtml(row.color)}"></span>
        <span class="legend-name" title="${escapeHtml(row.name || "Ukjent")}">${escapeHtml(row.name || "Ukjent")}</span>
        <span>${int(row.count)}</span>
      </div>
    `;
  }).join("");
}

function renderChart(key, canvas, host, rows, emptyText) {
  const dataRows = chartRows(rows);
  destroyChart(key);
  renderLegend(host, dataRows, emptyText);

  if (!dataRows.length || !canvas || !window.Chart) {
    return;
  }

  state.charts[key] = new window.Chart(canvas, {
    type: "doughnut",
    data: {
      labels: dataRows.map(row => row.name || "Ukjent"),
      datasets: [{
        data: dataRows.map(row => toNum(row.count)),
        backgroundColor: dataRows.map(row => row.color),
        borderColor: "#ffffff",
        borderWidth: 2,
        hoverOffset: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "58%",
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: context => {
              const row = dataRows[context.dataIndex];
              return `${row.name}: ${int(row.count)} (${pct(row.percent)})`;
            },
          },
        },
      },
    },
  });
}

function rowLocations(row) {
  return row.location_counts || [];
}

function rowLocationText(row) {
  const locations = rowLocations(row);
  if (!locations.length) return "Ukjent";
  return locations.map(item => `${item.name || "Ukjent"} (${int(item.count)})`).join(", ");
}

function rowArchiveText(row) {
  const archives = row.archive_counts || [];
  if (!archives.length) return "";
  return archives.map(item => item.name).filter(Boolean).join(" ");
}

function searchableText(row) {
  return [
    row.serie_path,
    row.serie_identifikator,
    row.serie_navn,
    rowLocationText(row),
    rowArchiveText(row),
  ].map(safeText).join(" ").toLowerCase();
}

function filteredRows() {
  const q = safeText(el.searchInput.value).toLowerCase();
  const location = safeText(el.locationFilter.value);

  return state.rows.filter(row => {
    if (q && !searchableText(row).includes(q)) return false;
    if (location) {
      const hasLocation = rowLocations(row).some(item => (item.name || "Ukjent") === location);
      if (!hasLocation) return false;
    }
    return true;
  });
}

function renderLocationFilter(summary) {
  const current = el.locationFilter.value;
  const locations = (summary.locations || []).map(item => item.name || "Ukjent");
  el.locationFilter.innerHTML = `
    <option value="">Alle lokasjoner</option>
    ${locations.map(location => `
      <option value="${escapeHtml(location)}">${escapeHtml(location)}</option>
    `).join("")}
  `;
  if (locations.includes(current)) {
    el.locationFilter.value = current;
  }
}

function renderPills(items, className = "") {
  if (!items?.length) return `<span class="muted">-</span>`;
  return `
    <div class="pill-list">
      ${items.map(item => `
        <span class="mini-pill ${className}">${escapeHtml(item)}</span>
      `).join("")}
    </div>
  `;
}

function renderCountPills(items) {
  if (!items?.length) return `<span class="muted">Ukjent</span>`;
  return `
    <div class="pill-list">
      ${items.slice(0, 4).map(item => `
        <span class="mini-pill">${escapeHtml(item.name || "Ukjent")}: ${int(item.count)}</span>
      `).join("")}
    </div>
  `;
}

function renderTable() {
  const rows = filteredRows();

  if (!rows.length) {
    el.tableBody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state">Ingen serier matcher filtrene.</td>
      </tr>
    `;
    return;
  }

  el.tableBody.innerHTML = rows.map(row => {
    const affectedPct = row.stykke_count
      ? (toNum(row.missing_count) / toNum(row.stykke_count)) * 100
      : 0;
    const title = [row.serie_identifikator, row.serie_navn].filter(Boolean).join(" - ");
    const path = row.serie_path || title || "-";

    return `
      <tr>
        <td class="path-cell">
          <strong>${escapeHtml(title || path)}</strong>
          <div class="muted">${escapeHtml(path)}</div>
          <div class="muted">Serieår ${escapeHtml(row.startaar ?? "-")}–${escapeHtml(row.sluttaar ?? "-")}</div>
        </td>
        <td class="number">${int(row.stykke_count)}</td>
        <td class="number"><strong>${int(row.missing_count)}</strong></td>
        <td class="number">${pct(affectedPct)}</td>
        <td>${renderCountPills(row.location_counts)}</td>
        <td>${renderPills(row.issue_types || [], "issue-pill")}</td>
      </tr>
    `;
  }).join("");
}

function render(data) {
  state.summary = data.summary || {};
  state.rows = (data.items || [])
    .slice()
    .sort((a, b) =>
      toNum(b.missing_count) - toNum(a.missing_count) ||
      safeText(a.serie_path).localeCompare(safeText(b.serie_path), "no")
    );

  renderKpis(state.summary);
  renderChart("locations", el.locationChart, el.locationBars, state.summary.locations || [], "Ingen lokasjonsdata funnet.");
  renderChart("archives", el.archiveChart, el.archiveBars, state.summary.archives || [], "Ingen arkivdata funnet.");
  renderLocationFilter(state.summary);
  renderTable();
}

async function loadData() {
  setLoading(true);
  setStatus("Laster data...");
  try {
    const data = await apiGet("/api/missing-date-series");
    if (data?.error) {
      throw new Error(data.error);
    }
    render(data);
    setStatus(`Sist oppdatert ${new Date().toLocaleString("no-NO")}`);
  } catch (error) {
    console.error(error);
    destroyChart("locations");
    destroyChart("archives");
    el.kpiGrid.innerHTML = "";
    el.locationBars.innerHTML = "";
    el.archiveBars.innerHTML = "";
    el.tableBody.innerHTML = `
      <tr>
        <td colspan="6" class="error-state">Kunne ikke hente data: ${escapeHtml(error.message)}</td>
      </tr>
    `;
    setStatus("Kunne ikke hente data", true);
  } finally {
    setLoading(false);
  }
}

async function init() {
  const me = await initProtectedPage();
  if (!me) return;

  el.searchInput.addEventListener("input", renderTable);
  el.locationFilter.addEventListener("change", renderTable);

  await loadData();
}

document.addEventListener("DOMContentLoaded", init);
