// Phase 1: Filters + Sortable Table (slice & dice)
const lokasjonFilter = document.getElementById("lokasjonFilter");
const tagFilter = document.getElementById("tagFilter");
const searchFilter = document.getElementById("searchFilter");
const digMin = document.getElementById("digMin");
const digMax = document.getElementById("digMax");
const minViewsMedia = document.getElementById("minViewsMedia");
const resetBtn = document.getElementById("resetBtn");

const statsEl = document.getElementById("stats");
const tableHeadRow = document.getElementById("tableHeadRow");
const tableBody = document.getElementById("arkivTableBody");

// ✅ Change this to your deployed FastAPI base URL if needed
// Option A (same origin proxy): const API_BASE = "";
// Option B (your current pattern - absolute):
const API_BASE = "https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net";

const state = {
  raw: [],
  filtered: [],
  sortKey: "views_media",
  sortDir: "desc", // "asc" | "desc"
};

// Columns to show in table (Phase 1)
const columns = [
  { key: "navn", label: "Navn", numeric: false },
  { key: "lokasjon", label: "Lokasjon", numeric: false },
  { key: "identifikator", label: "Identifikator", numeric: false },
  { key: "percentage_digitized", label: "Digitalisert (%)", numeric: true, fmt: v => pct(v) },
  { key: "stykke_count", label: "Stykker", numeric: true, fmt: v => int(v) },
  { key: "views_media", label: "Visninger (Media)", numeric: true, fmt: v => int(v) },
  { key: "views_digark", label: "Visninger (DigArk)", numeric: true, fmt: v => int(v) },
  { key: "views_internal", label: "Visninger (Intern)", numeric: true, fmt: v => int(v) },
  { key: "average_views_media", label: "Gj.snitt Media", numeric: true, fmt: v => num(v, 2) },
  { key: "average_views_digark", label: "Gj.snitt DigArk", numeric: true, fmt: v => num(v, 2) },
  { key: "requisitions_internal", label: "Rekvisisjoner (Intern)", numeric: true, fmt: v => int(v) },
  { key: "requisitions_ap", label: "Rekvisisjoner (AP)", numeric: true, fmt: v => int(v) },
  { key: "tags", label: "Tags", numeric: false },
];

init();

async function init() {
  wireEvents();
  buildTableHeader();

  const data = await fetchData();
  state.raw = normalizeRows(data);

  populateLokasjon(state.raw);
  applyFiltersAndRender();
}

function wireEvents() {
  lokasjonFilter.addEventListener("change", applyFiltersAndRender);
  tagFilter.addEventListener("input", debounce(applyFiltersAndRender, 150));
  searchFilter.addEventListener("input", debounce(applyFiltersAndRender, 150));

  digMin.addEventListener("input", applyFiltersAndRender);
  digMax.addEventListener("input", applyFiltersAndRender);
  minViewsMedia.addEventListener("input", applyFiltersAndRender);

  resetBtn.addEventListener("click", () => {
    lokasjonFilter.value = "ALL";
    tagFilter.value = "";
    searchFilter.value = "";
    digMin.value = 0;
    digMax.value = 100;
    minViewsMedia.value = 0;
    state.sortKey = "views_media";
    state.sortDir = "desc";
    applyFiltersAndRender();
  });
}

async function fetchData() {
  const url = `${API_BASE}/api/arkiv-overview`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return await res.json();
}

function normalizeRows(rows) {
  // Ensure types are sane (SQL might come as Decimal/str depending on driver)
  return rows.map(r => ({
    ...r,
    percentage_digitized: toNum(r.percentage_digitized),
    stykke_count: toNum(r.stykke_count),
    views_internal: toNum(r.views_internal),
    views_media: toNum(r.views_media),
    views_digark: toNum(r.views_digark),
    topdesk_references: toNum(r.topdesk_references),
    average_views_media: toNum(r.average_views_media),
    average_views_digark: toNum(r.average_views_digark),
    requisitions_internal: toNum(r.requisitions_internal),
    requisitions_ap: toNum(r.requisitions_ap),
    tags: (r.tags ?? "").toString(),
    navn: (r.navn ?? "").toString(),
    lokasjon: (r.lokasjon ?? "").toString(),
    identifikator: (r.identifikator ?? "").toString(),
  }));
}

function populateLokasjon(data) {
  const unique = Array.from(new Set(data.map(d => d.lokasjon).filter(Boolean))).sort();
  for (const loc of unique) {
    const opt = document.createElement("option");
    opt.value = loc;
    opt.textContent = loc;
    lokasjonFilter.appendChild(opt);
  }
}

function buildTableHeader() {
  tableHeadRow.innerHTML = "";

  for (const col of columns) {
    const th = document.createElement("th");
    th.textContent = col.label;
    th.style.cursor = "pointer";
    th.style.padding = "10px";
    th.style.borderBottom = "1px solid #e5e5e5";
    th.style.textAlign = col.numeric ? "right" : "left";
    th.dataset.key = col.key;

    th.addEventListener("click", () => {
      if (state.sortKey === col.key) {
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.sortKey = col.key;
        state.sortDir = col.numeric ? "desc" : "asc";
      }
      applyFiltersAndRender();
    });

    tableHeadRow.appendChild(th);
  }
}

function applyFiltersAndRender() {
  const selectedLok = lokasjonFilter.value;
  const tagQ = (tagFilter.value || "").trim().toLowerCase();
  const searchQ = (searchFilter.value || "").trim().toLowerCase();

  const minDig = clamp(toNum(digMin.value), 0, 100);
  const maxDig = clamp(toNum(digMax.value), 0, 100);
  const minAvgMedia = Math.max(0, toNum(minViewsMedia.value));

  const digLo = Math.min(minDig, maxDig);
  const digHi = Math.max(minDig, maxDig);

  state.filtered = state.raw.filter(d => {
    if (selectedLok !== "ALL" && d.lokasjon !== selectedLok) return false;

    // percentage_digitized is stored 0..1 in DB; compare in %
    const digPct = (d.percentage_digitized ?? 0) * 100;
    if (digPct < digLo || digPct > digHi) return false;

    if ((d.average_views_media ?? 0) < minAvgMedia) return false;

    if (tagQ) {
      const tags = (d.tags ?? "").toLowerCase();
      if (!tags.includes(tagQ)) return false;
    }

    if (searchQ) {
      const hay = `${d.navn} ${d.identifikator}`.toLowerCase();
      if (!hay.includes(searchQ)) return false;
    }

    return true;
  });

  sortFiltered();
  renderStats();
  renderTable();
  renderHeaderIndicators();
}

function sortFiltered() {
  const { sortKey, sortDir } = state;
  const col = columns.find(c => c.key === sortKey);
  const dir = sortDir === "asc" ? 1 : -1;

  state.filtered.sort((a, b) => {
    const av = a?.[sortKey];
    const bv = b?.[sortKey];

    if (col?.numeric) {
      return (toNum(av) - toNum(bv)) * dir;
    }

    const as = (av ?? "").toString().toLowerCase();
    const bs = (bv ?? "").toString().toLowerCase();
    return as.localeCompare(bs) * dir;
  });
}

function renderHeaderIndicators() {
  const ths = tableHeadRow.querySelectorAll("th");
  ths.forEach(th => {
    const key = th.dataset.key;
    const arrow = key === state.sortKey ? (state.sortDir === "asc" ? " ▲" : " ▼") : "";
    const col = columns.find(c => c.key === key);
    th.textContent = (col?.label ?? key) + arrow;
  });
}

function renderStats() {
  const total = state.raw.length;
  const shown = state.filtered.length;

  // Quick aggregates for visible data
  const sumViewsMedia = state.filtered.reduce((acc, d) => acc + toNum(d.views_media), 0);
  const avgDigPct = state.filtered.length
    ? (state.filtered.reduce((acc, d) => acc + (toNum(d.percentage_digitized) * 100), 0) / state.filtered.length)
    : 0;

  statsEl.textContent =
    `Viser ${shown} av ${total} arkiver • Sum Media-visninger: ${sumViewsMedia.toLocaleString("no-NO")} • ` +
    `Snitt digitaliseringsgrad: ${avgDigPct.toFixed(2)}%`;
}

function renderTable() {
  tableBody.innerHTML = "";

  for (const row of state.filtered) {
    const tr = document.createElement("tr");
    tr.style.borderBottom = "1px solid #f0f0f0";

    for (const col of columns) {
      const td = document.createElement("td");
      td.style.padding = "10px";
      td.style.verticalAlign = "top";
      td.style.textAlign = col.numeric ? "right" : "left";

      let value = row[col.key];

      if (col.fmt) value = col.fmt(value);

      // Slightly nicer tags cell
      if (col.key === "tags") {
        td.style.maxWidth = "520px";
        td.style.whiteSpace = "normal";
        td.style.lineHeight = "1.2";
      }

      td.textContent = value ?? "";
      tr.appendChild(td);
    }

    tableBody.appendChild(tr);
  }

  if (state.filtered.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = columns.length;
    td.style.padding = "14px";
    td.style.color = "#777";
    td.textContent = "Ingen treff. Prøv å justere filtrene.";
    tr.appendChild(td);
    tableBody.appendChild(tr);
  }
}

/* ---------------- utils ---------------- */

function toNum(v) {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pct(v01) {
  const p = toNum(v01) * 100;
  return `${p.toFixed(2)}%`;
}

function int(v) {
  return Math.round(toNum(v)).toLocaleString("no-NO");
}

function num(v, decimals = 2) {
  return toNum(v).toFixed(decimals);
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
