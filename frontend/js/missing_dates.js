import { initProtectedPage, apiGet, apiPost } from "./page_auth.js";

const el = {
  loadingOverlay: document.getElementById("loadingOverlay"),
  refreshBtn: document.getElementById("refreshBtn"),
  statusText: document.getElementById("statusText"),
  kpiGrid: document.getElementById("kpiGrid"),
  locationBars: document.getElementById("locationBars"),
  archiveBars: document.getElementById("archiveBars"),
  searchInput: document.getElementById("searchInput"),
  locationFilter: document.getElementById("locationFilter"),
  tableBody: document.getElementById("tableBody"),
};

const state = {
  rows: [],
  summary: {},
};

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
      "Datagrunnlag",
      int(summary.total_series),
      `${int(summary.total_stykker)} stykker totalt`
    ),
  ].join("");
}

function renderBars(host, rows, emptyText) {
  if (!rows?.length) {
    host.innerHTML = `<div class="empty-state">${escapeHtml(emptyText)}</div>`;
    return;
  }

  const max = Math.max(...rows.map(row => toNum(row.count)), 1);
  host.innerHTML = rows.map(row => {
    const width = Math.max(4, (toNum(row.count) / max) * 100);
    return `
      <div class="bar-row">
        <div class="bar-top">
          <span class="bar-name" title="${escapeHtml(row.name || "Ukjent")}">${escapeHtml(row.name || "Ukjent")}</span>
          <span>${int(row.count)} (${pct(row.percent)})</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${width}%;"></div>
        </div>
      </div>
    `;
  }).join("");
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
    row.ordre,
    row.serie_path,
    row.serie_identifikator,
    row.serie_navn,
    rowLocationText(row),
    rowArchiveText(row),
    ...(row.missing_item_ids || []),
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

function renderSamples(row) {
  const samples = row.sample_items || [];
  if (samples.length) {
    return renderPills(samples.map(item => {
      const shelf = item.hylleplassering ? ` - ${item.hylleplassering}` : "";
      return `${item.identifikator || "-"}${shelf}`;
    }));
  }
  return renderPills((row.missing_item_ids || []).slice(0, 5));
}

function renderTable() {
  const rows = filteredRows();

  if (!rows.length) {
    el.tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">Ingen serier matcher filtrene.</td>
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
          <div class="muted">Ordre ${escapeHtml(row.ordre ?? "-")} · ${escapeHtml(row.startaar ?? "-")}–${escapeHtml(row.sluttaar ?? "-")}</div>
        </td>
        <td class="number">${int(row.stykke_count)}</td>
        <td class="number"><strong>${int(row.missing_count)}</strong></td>
        <td class="number">${pct(affectedPct)}</td>
        <td>${renderCountPills(row.location_counts)}</td>
        <td>${renderPills(row.issue_types || [], "issue-pill")}</td>
        <td>${renderSamples(row)}</td>
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
  renderBars(el.locationBars, state.summary.locations || [], "Ingen lokasjonsdata funnet.");
  renderBars(el.archiveBars, state.summary.archives || [], "Ingen arkivdata funnet.");
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
    el.kpiGrid.innerHTML = "";
    el.locationBars.innerHTML = "";
    el.archiveBars.innerHTML = "";
    el.tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="error-state">Kunne ikke hente data: ${escapeHtml(error.message)}</td>
      </tr>
    `;
    setStatus("Kunne ikke hente data", true);
  } finally {
    setLoading(false);
  }
}

async function refreshValidation() {
  el.refreshBtn.disabled = true;
  setLoading(true);
  setStatus("Oppdaterer valideringsgrunnlaget...");
  try {
    const out = await apiPost("/api/validation-status/refresh", {});
    if (out?.ok !== true) {
      throw new Error(out?.error || "Oppdatering feilet");
    }
    await loadData();
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Oppdatering feilet", true);
  } finally {
    el.refreshBtn.disabled = false;
    setLoading(false);
  }
}

async function init() {
  const me = await initProtectedPage();
  if (!me) return;

  el.searchInput.addEventListener("input", renderTable);
  el.locationFilter.addEventListener("change", renderTable);
  el.refreshBtn.addEventListener("click", refreshValidation);

  await loadData();
}

document.addEventListener("DOMContentLoaded", init);
