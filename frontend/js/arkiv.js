/* ========= CONFIG ========= */
const API_BASE =
  "https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net";

/* ========= STATE ========= */
const state = {
  raw: [],
  filtered: [],
  page: 1,
  pageSize: 100,
  sortKey: "views_media",
  sortDir: "desc"
};

/* ========= ELEMENTS ========= */
const lokasjonFilter = document.getElementById("lokasjonFilter");
const tagFilter = document.getElementById("tagFilter");
const searchFilter = document.getElementById("searchFilter");
const digMin = document.getElementById("digMin");
const digMax = document.getElementById("digMax");
const minViewsMedia = document.getElementById("minViewsMedia");
const resetBtn = document.getElementById("resetBtn");
const statsEl = document.getElementById("stats");
const headEl = document.getElementById("tableHead");
const bodyEl = document.getElementById("tableBody");
const paginationEl = document.getElementById("pagination");

/* ========= COLUMNS ========= */
const columns = [
  { key: "navn", label: "Navn" },
  { key: "lokasjon", label: "Lokasjon" },
  { key: "identifikator", label: "Identifikator" },
  { key: "_digPct", label: "Digitalisert (%)", numeric: true, fmt: v => v.toFixed(2) },
  { key: "views_media", label: "Media-visninger", numeric: true },
  { key: "views_digark", label: "DigArk-visninger", numeric: true },
  { key: "average_views_media", label: "Gj.snitt Media", numeric: true, fmt: v => v.toFixed(2) },
  { key: "requisitions_ap", label: "Rekvisisjoner AP", numeric: true },
  { key: "tags", label: "Tags" }
];

/* ========= INIT ========= */
init();

async function init() {
  buildHeader();
  const data = await fetchData();
  state.raw = normalize(data);
  populateLokasjon();
  applyFilters();
}

/* ========= DATA ========= */
async function fetchData() {
  const res = await fetch(`${API_BASE}/api/arkiv-overview`);
  return await res.json();
}

function normalize(rows) {
  return rows.map(r => ({
    ...r,
    views_media: +r.views_media || 0,
    views_digark: +r.views_digark || 0,
    average_views_media: +r.average_views_media || 0,
    requisitions_ap: +r.requisitions_ap || 0,
    _digPct: (+r.percentage_digitized || 0) * 100,
    _tagsLc: (r.tags || "").toLowerCase(),
    _searchLc: `${r.navn || ""} ${r.identifikator || ""}`.toLowerCase()
  }));
}

/* ========= UI ========= */
function buildHeader() {
  headEl.innerHTML = "";
  for (const c of columns) {
    const th = document.createElement("th");
    th.textContent = c.label;
    th.style.cursor = "pointer";
    th.style.padding = "10px";
    th.onclick = () => toggleSort(c.key, c.numeric);
    headEl.appendChild(th);
  }
}

function populateLokasjon() {
  [...new Set(state.raw.map(d => d.lokasjon).filter(Boolean))]
    .sort()
    .forEach(l => {
      const o = document.createElement("option");
      o.value = l;
      o.textContent = l;
      lokasjonFilter.appendChild(o);
    });
}

/* ========= FILTERING ========= */
function applyFilters() {
  state.page = 1;

  const loc = lokasjonFilter.value;
  const tagQ = tagFilter.value.toLowerCase();
  const searchQ = searchFilter.value.toLowerCase();
  const lo = Math.min(+digMin.value, +digMax.value);
  const hi = Math.max(+digMin.value, +digMax.value);
  const minMedia = +minViewsMedia.value || 0;

  state.filtered = state.raw.filter(d =>
    (loc === "ALL" || d.lokasjon === loc) &&
    d._digPct >= lo && d._digPct <= hi &&
    d.average_views_media >= minMedia &&
    (!tagQ || d._tagsLc.includes(tagQ)) &&
    (!searchQ || d._searchLc.includes(searchQ))
  );

  sort();
  render();
}

/* ========= SORT ========= */
function toggleSort(key, numeric) {
  if (state.sortKey === key) {
    state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
  } else {
    state.sortKey = key;
    state.sortDir = numeric ? "desc" : "asc";
  }
  sort();
  render();
}

function sort() {
  const dir = state.sortDir === "asc" ? 1 : -1;
  const key = state.sortKey;

  state.filtered.sort((a, b) =>
    (a[key] > b[key] ? 1 : -1) * dir
  );
}

/* ========= RENDER ========= */
function render() {
  renderStats();
  renderTable();
  renderPagination();
}

function renderStats() {
  statsEl.textContent =
    `Viser ${state.filtered.length} arkiver`;
}

function renderTable() {
  bodyEl.innerHTML = "";
  const start = (state.page - 1) * state.pageSize;
  const page = state.filtered.slice(start, start + state.pageSize);

  for (const r of page) {
    const tr = document.createElement("tr");
    for (const c of columns) {
      const td = document.createElement("td");
      td.style.padding = "10px";
      let v = r[c.key];
      if (c.fmt) v = c.fmt(v);
      td.textContent = v ?? "";
      tr.appendChild(td);
    }
    bodyEl.appendChild(tr);
  }
}

function renderPagination() {
  paginationEl.innerHTML = "";
  const pages = Math.ceil(state.filtered.length / state.pageSize);
  if (pages <= 1) return;

  const prev = btn("◀ Forrige", state.page === 1, () => {
    state.page--; render();
  });
  const next = btn("Neste ▶", state.page === pages, () => {
    state.page++; render();
  });

  paginationEl.append(prev, `Side ${state.page} / ${pages}`, next);
}

function btn(txt, disabled, fn) {
  const b = document.createElement("button");
  b.textContent = txt;
  b.disabled = disabled;
  b.onclick = fn;
  return b;
}

/* ========= EVENTS ========= */
const debounced = debounce(applyFilters, 120);
[lokasjonFilter, tagFilter, searchFilter, digMin, digMax, minViewsMedia]
  .forEach(el => el.addEventListener("input", debounced));

resetBtn.onclick = () => {
  lokasjonFilter.value = "ALL";
  tagFilter.value = "";
  searchFilter.value = "";
  digMin.value = 0;
  digMax.value = 100;
  minViewsMedia.value = 0;
  applyFilters();
};

/* ========= UTILS ========= */
function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}
