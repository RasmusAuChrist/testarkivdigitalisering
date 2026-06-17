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
  pageInfo: document.getElementById("pageInfo"),
  pageSizeSelect: document.getElementById("pageSizeSelect"),
  prevPageBtn: document.getElementById("prevPageBtn"),
  nextPageBtn: document.getElementById("nextPageBtn"),
  sortableHeaders: document.querySelectorAll("[data-sort-key]"),
};

const state = {
  rows: [],
  summary: {},
  hasLoadedSummary: false,
  pagination: {
    page: 1,
    page_size: 50,
    total_items: 0,
    total_pages: 1,
    has_previous: false,
    has_next: false,
  },
  sort: {
    by: "missing",
    dir: "desc",
  },
  charts: {
    locations: null,
    archives: null,
  },
};

let searchTimer = null;

const CHART_COLORS = [
  "#123a63",
  "#c7a13b",
  "#2f6f9f",
  "#7c8da4",
  "#8c6f2a",
  "#d7c98b",
];

const ASTA_GUI_BASE = "https://av.stiftelsen-asta.no/gui/";

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

function renderKpisLegacy(summary) {
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

function renderKpis(summary) {
  el.kpiGrid.innerHTML = [
    kpiCard(
      "Berørte serier",
      int(summary.series_with_missing),
      `${pct(summary.affected_series_percent)} av ${int(summary.total_series)} serier · ${int(summary.fully_missing_series)} har 100 % avvik`
    ),
    kpiCard(
      "Stykker med avvik",
      int(summary.missing_items),
      `${pct(summary.missing_items_percent)} av ${int(summary.total_stykker)} stykker`
    ),
    kpiCard(
      "Mangler begge år",
      int(summary.both_missing_items),
      `${pct(summary.both_missing_items_percent)} av avvikene`
    ),
    kpiCard(
      "Bare startår",
      int(summary.start_only_items),
      `${pct(summary.start_only_items_percent)} av avvikene`
    ),
    kpiCard(
      "Bare sluttår",
      int(summary.slutt_only_items),
      `${pct(summary.slutt_only_items_percent)} av avvikene`
    ),
    kpiCard(
      "Kjent lokasjon",
      int(summary.items_with_known_location),
      `${pct(summary.items_with_known_location_percent)} av avvikene`
    ),
  ].join("");
}

function renderSummaryLoading() {
  el.kpiGrid.innerHTML = [
    kpiCard("Berørte serier", "...", "Totalstatistikk lastes separat"),
    kpiCard("Stykker med avvik", "...", "Listen kan brukes imens"),
    kpiCard("Mangler begge år", "...", "Venter på summering"),
    kpiCard("Bare startår", "...", "Venter på summering"),
    kpiCard("Bare sluttår", "...", "Venter på summering"),
    kpiCard("Kjent lokasjon", "...", "Venter på summering"),
  ].join("");
}

function renderSummary(summary) {
  state.summary = summary || {};
  state.hasLoadedSummary = true;
  renderKpis(state.summary);
  renderChart("locations", el.locationChart, el.locationBars, state.summary.locations || [], "Ingen lokasjonsdata funnet.");
  renderChart("archives", el.archiveChart, el.archiveBars, state.summary.archives || [], "Ingen arkivdata funnet.");
  renderLocationFilter(state.summary);
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

function renderLocationFilter(summary) {
  const current = el.locationFilter.value;
  const locations = summary.location_options || (summary.locations || []).map(item => item.name || "Ukjent");
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

function buildAstaSeriesUrl(row) {
  const amid = safeText(row.external_amid || row._amid);
  if (!amid) return "";

  const historyLabel =
    [row.serie_identifikator, row.serie_navn].filter(Boolean).join(" - ")
    || row.serie_path
    || "Åpne i ASTA";

  const payload = {
    c: "c",
    h: historyLabel,
    cid: amid,
    aid: "isadg",
    enm: "SERIE",
  };

  const params = new URLSearchParams({
    userHistoryLoaded: "true",
    ta: "1",
    t_1: JSON.stringify(payload),
  });

  return `${ASTA_GUI_BASE}?${params.toString()}`;
}

function astaButton(row) {
  const href = buildAstaSeriesUrl(row);
  if (!href) return "";

  return `
    <a
      class="asta-shortcut"
      href="${escapeHtml(href)}"
      target="_blank"
      rel="noopener noreferrer"
      title="Åpne i baseinformasjonssystemet"
    >
      Åpne i ASTA
    </a>
  `;
}

function renderTable() {
  const rows = state.rows || [];

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
          ${astaButton(row)}
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

function renderSortHeaders() {
  el.sortableHeaders.forEach(header => {
    const key = header.dataset.sortKey;
    const label = header.dataset.sortLabel || header.textContent.replace(/[▲▼]/g, "").trim();
    const isActive = state.sort.by === key;
    const arrow = isActive ? (state.sort.dir === "asc" ? "▲" : "▼") : "";

    header.classList.toggle("is-active", isActive);
    header.setAttribute("aria-sort", isActive ? (state.sort.dir === "asc" ? "ascending" : "descending") : "none");
    header.querySelector(".sort-label").textContent = label;
    header.querySelector(".sort-arrow").textContent = arrow;
  });
}

function renderPagination() {
  const page = toNum(state.pagination.page) || 1;
  const pageSize = toNum(state.pagination.page_size) || 50;
  const totalKnown = state.pagination.total_items !== null && state.pagination.total_items !== undefined;
  const total = totalKnown ? toNum(state.pagination.total_items) : null;
  const totalPages = state.pagination.total_pages
    ? Math.max(1, toNum(state.pagination.total_pages) || 1)
    : null;
  const rowCount = (state.rows || []).length;
  const from = rowCount ? ((page - 1) * pageSize) + 1 : 0;
  const to = rowCount ? from + rowCount - 1 : 0;

  if (el.pageInfo) {
    if (!rowCount) {
      el.pageInfo.textContent = "Ingen serier matcher filtrene.";
    } else if (totalKnown) {
      el.pageInfo.textContent = `${int(from)}–${int(Math.min(to, total))} av ${int(total)} serier · side ${int(page)} av ${int(totalPages)}`;
    } else {
      el.pageInfo.textContent = `${int(from)}–${int(to)} · side ${int(page)}${state.pagination.has_next ? " · flere finnes" : ""}`;
    }
  }

  if (el.pageSizeSelect) {
    el.pageSizeSelect.value = String(pageSize);
  }

  if (el.prevPageBtn) {
    el.prevPageBtn.disabled = !state.pagination.has_previous;
  }

  if (el.nextPageBtn) {
    el.nextPageBtn.disabled = !state.pagination.has_next;
  }
}

function render(data) {
  if (data.summary) {
    renderSummary(data.summary);
  }

  state.rows = data.items || [];
  state.pagination = {
    ...state.pagination,
    ...(data.pagination || {}),
  };

  renderTable();
  renderSortHeaders();
  renderPagination();
}

function currentQueryParams(page, includeSummary) {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(state.pagination.page_size || 50),
    include_summary: includeSummary ? "true" : "false",
    sort_by: state.sort.by,
    sort_dir: state.sort.dir,
  });
  const q = safeText(el.searchInput.value);
  const location = safeText(el.locationFilter.value);

  if (q) params.set("q", q);
  if (location) params.set("location", location);

  return params.toString();
}

async function loadData({ page = state.pagination.page, includeSummary = false } = {}) {
  setLoading(true);
  setStatus("Laster data...");
  try {
    const query = currentQueryParams(page, includeSummary);
    const data = await apiGet(`/api/missing-date-series?${query}`);
    if (data?.error) {
      throw new Error(data.error);
    }
    render(data);
    setStatus(`Sist oppdatert ${new Date().toLocaleString("no-NO")}`);
  } catch (error) {
    console.error(error);
    if (!state.hasLoadedSummary) {
      destroyChart("locations");
      destroyChart("archives");
      el.kpiGrid.innerHTML = "";
      el.locationBars.innerHTML = "";
      el.archiveBars.innerHTML = "";
    }
    if (el.pageInfo) {
      el.pageInfo.textContent = "Kunne ikke hente data.";
    }
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

async function loadSummary() {
  setStatus("Laster totalstatistikk...");
  try {
    const data = await apiGet("/api/missing-date-series?page=1&page_size=10&include_summary=true&summary_only=true");
    if (data?.error) {
      throw new Error(data.error);
    }
    if (data.summary) {
      renderSummary(data.summary);
    }
    setStatus(`Sist oppdatert ${new Date().toLocaleString("no-NO")}`);
  } catch (error) {
    console.error(error);
    setStatus("Listen er lastet, men totalstatistikk tok for lang tid", true);
  }
}

async function init() {
  const me = await initProtectedPage();
  if (!me) return;

  el.sortableHeaders.forEach(header => {
    header.addEventListener("click", () => {
      const key = header.dataset.sortKey;
      if (!key) return;

      if (state.sort.by === key) {
        state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
      } else {
        state.sort.by = key;
        state.sort.dir = key === "serie" ? "asc" : "desc";
      }

      loadData({ page: 1, includeSummary: false });
    });
  });

  el.searchInput.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      loadData({ page: 1, includeSummary: false });
    }, 350);
  });

  el.locationFilter.addEventListener("change", () => {
    loadData({ page: 1, includeSummary: false });
  });

  el.pageSizeSelect.addEventListener("change", () => {
    state.pagination.page_size = Number(el.pageSizeSelect.value) || 50;
    loadData({ page: 1, includeSummary: false });
  });

  el.prevPageBtn.addEventListener("click", () => {
    if (!state.pagination.has_previous) return;
    loadData({ page: Math.max(1, toNum(state.pagination.page) - 1), includeSummary: false });
  });

  el.nextPageBtn.addEventListener("click", () => {
    if (!state.pagination.has_next) return;
    loadData({ page: toNum(state.pagination.page) + 1, includeSummary: false });
  });

  renderSummaryLoading();
  await loadData({ page: 1, includeSummary: false });
  loadSummary();
}

document.addEventListener("DOMContentLoaded", init);
