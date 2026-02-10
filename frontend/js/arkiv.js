/* =========================================================
   CONFIG
========================================================= */

const API_BASE =
  "https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net";

/* =========================================================
   STATE
========================================================= */

const state = {
  raw: [],
  filtered: [],

  page: 1,
  pageSize: 100,

  sortKey: "views_media",
  sortDir: "desc",

  selectedLokasjoner: [],
  selectedTags: [],
  selectedSerier: []
};

/* =========================================================
   ELEMENTS
========================================================= */

const searchFilter = document.getElementById("searchFilter");
const digMin = document.getElementById("digMin");
const digMax = document.getElementById("digMax");
const minViewsMedia = document.getElementById("minViewsMedia");
const resetBtn = document.getElementById("resetBtn");

const statsEl = document.getElementById("stats");
const headEl = document.getElementById("tableHead");
const bodyEl = document.getElementById("tableBody");
const paginationEl = document.getElementById("pagination");

const scrollTopEl = document.getElementById("tableScrollTop");
const scrollTopSpacerEl = document.getElementById("tableScrollTopSpacer");
const scrollMainEl = document.getElementById("tableScrollMain");

const loadingOverlay = document.getElementById("loadingOverlay");

function showLoading() {
  if (loadingOverlay) loadingOverlay.style.display = "flex";
}

function hideLoading() {
  if (loadingOverlay) loadingOverlay.style.display = "none";
}


/* =========================================================
   COLUMNS
========================================================= */

const columns = [
  { key: "navn", label: "Navn" },
  { key: "lokasjon", label: "Lokasjon" },
  { key: "identifikator", label: "Identifikator" },

  { key: "_digPct", label: "Digitalisert (%)", numeric: true, fmt: v => v.toFixed(2) },

  { key: "stykke_count", label: "Stykke", numeric: true, fmt: int },
  { key: "views_internal", label: "Visninger (Intern)", numeric: true, fmt: int },
  { key: "views_media", label: "Visninger (Media)", numeric: true, fmt: int },
  { key: "views_digark", label: "Visninger (DigArk)", numeric: true, fmt: int },

  { key: "topdesk_references", label: "Topdesk refs", numeric: true, fmt: int },

  { key: "average_views_media", label: "Gj.snitt Media", numeric: true, fmt: v => num(v, 2) },
  { key: "average_views_digark", label: "Gj.snitt DigArk", numeric: true, fmt: v => num(v, 2) },

  { key: "requisitions_internal", label: "Rekvisisjoner (Intern)", numeric: true, fmt: int },
  { key: "requisitions_ap", label: "Rekvisisjoner (AP)", numeric: true, fmt: int },

  { key: "serier", label: "Hovedserier" }, // second-to-last
  { key: "tags", label: "Tags" }
];

/* =========================================================
   INIT
========================================================= */

async function init() {
  showLoading();

  try {
    buildTableHeader();

    const data = await fetchData();
    state.raw = normalizeRows(data);

    buildLokasjonDropdown();
    buildTagsDropdown();
    buildSerierDropdown();

    wireEvents();

    applyFilters();
    setupHorizontalScrollSync();
    updateTopScrollbarSpacer();
  } catch (err) {
    console.error(err);
    // Optional: show a friendly message somewhere
    if (statsEl) statsEl.textContent = "Kunne ikke laste data.";
  } finally {
    hideLoading();
  }
}

/* =========================================================
   DATA
========================================================= */

async function fetchData() {
  const res = await fetch(`${API_BASE}/api/arkiv-overview`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return await res.json();
}

function normalizeRows(rows) {
  return rows.map(r => {
    const tagArr = splitList(r.tags);
    const serieArr = splitList(r.serier);

    return {
      ...r,

      // numbers
      views_media: toNum(r.views_media),
      views_digark: toNum(r.views_digark),
      views_internal: toNum(r.views_internal),
      stykke_count: toNum(r.stykke_count),
      topdesk_references: toNum(r.topdesk_references),
      average_views_media: toNum(r.average_views_media),
      average_views_digark: toNum(r.average_views_digark),
      requisitions_internal: toNum(r.requisitions_internal),
      requisitions_ap: toNum(r.requisitions_ap),
      _digPct: toNum(r.percentage_digitized) * 100,

      // strings
      navn: (r.navn ?? "").toString(),
      lokasjon: (r.lokasjon ?? "").toString(),
      identifikator: (r.identifikator ?? "").toString(),
      tags: (r.tags ?? "").toString(),
      serier: (r.serier ?? "").toString(),

      // derived
      _tagArr: tagArr,
      _serieArr: serieArr,
      _searchLc: `${r.navn ?? ""} ${r.identifikator ?? ""}`.toLowerCase()
    };
  });
}

function splitList(v) {
  return (v ?? "")
    .toString()
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

/* =========================================================
   MULTI-SELECT DROPDOWNS
========================================================= */

function createMultiSelect({ mountId, label, options, onChange }) {
  const mount = document.getElementById(mountId);
  const wrapper = document.createElement("div");
  wrapper.className = "multi-select";

  const button = document.createElement("button");
  button.type = "button";

  const panel = document.createElement("div");
  panel.className = "panel hidden";

  const controls = document.createElement("div");
  controls.className = "controls";

  const selectAllBtn = document.createElement("button");
  selectAllBtn.type = "button";
  selectAllBtn.textContent = "Velg alle";

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.textContent = "Tøm";

  controls.append(selectAllBtn, clearBtn);
  panel.appendChild(controls);

  const checkboxes = [];

  for (const opt of options) {
    const row = document.createElement("label");
    row.className = "option";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = opt;
    cb.checked = true;

    row.append(cb, document.createTextNode(opt));
    panel.appendChild(row);
    checkboxes.push(cb);
  }

  function update() {
    const selected = checkboxes.filter(c => c.checked).map(c => c.value);
    const txt =
      selected.length === options.length ? "Alle" :
      selected.length === 0 ? "Ingen" :
      `${selected.length} valgt`;

    button.textContent = `${label} (${txt})`;
    onChange(selected);
  }

  button.onclick = () => panel.classList.toggle("hidden");
  selectAllBtn.onclick = () => { checkboxes.forEach(c => c.checked = true); update(); };
  clearBtn.onclick = () => { checkboxes.forEach(c => c.checked = false); update(); };
  panel.addEventListener("change", update);

  document.addEventListener("click", e => {
    if (!wrapper.contains(e.target)) panel.classList.add("hidden");
  });

  wrapper.append(button, panel);
  mount.innerHTML = "";
  mount.appendChild(wrapper);

  update();
}

/* =========================================================
   DROPDOWN BUILDERS
========================================================= */

function buildLokasjonDropdown() {
  const opts = [...new Set(state.raw.map(d => d.lokasjon).filter(Boolean))].sort();
  createMultiSelect({
    mountId: "lokasjonDropdown",
    label: "Lokasjon",
    options: opts,
    onChange: v => { state.selectedLokasjoner = v; applyFilters(); }
  });
}

function buildTagsDropdown() {
  const set = new Set();
  state.raw.forEach(d => d._tagArr.forEach(t => set.add(t)));

  createMultiSelect({
    mountId: "tagsDropdown",
    label: "Tags",
    options: [...set].sort((a, b) => a.localeCompare(b, "no")),
    onChange: v => { state.selectedTags = v; applyFilters(); }
  });
}

function buildSerierDropdown() {
  const set = new Set();
  state.raw.forEach(d => d._serieArr.forEach(s => set.add(s)));

  createMultiSelect({
    mountId: "serierDropdown",
    label: "Hovedserier",
    options: [...set].sort((a, b) => a.localeCompare(b, "no")),
    onChange: v => { state.selectedSerier = v; applyFilters(); }
  });
}

/* =========================================================
   EVENTS
========================================================= */

function wireEvents() {
  const debounced = debounce(applyFilters, 120);

  searchFilter.addEventListener("input", debounced);
  digMin.addEventListener("input", debounced);
  digMax.addEventListener("input", debounced);
  minViewsMedia.addEventListener("input", debounced);

  resetBtn.addEventListener("click", () => {
    searchFilter.value = "";
    digMin.value = 0;
    digMax.value = 100;
    minViewsMedia.value = 0;

    state.sortKey = "views_media";
    state.sortDir = "desc";
    state.page = 1;

    // rebuild dropdowns (select all)
    buildLokasjonDropdown();
    buildTagsDropdown();
    buildSerierDropdown();

    applyFilters();
  });

  window.addEventListener("resize", debounce(updateTopScrollbarSpacer, 150));
}

/* =========================================================
   FILTERING + SORTING
========================================================= */

function applyFilters() {
  state.page = 1;

  const q = searchFilter.value.trim().toLowerCase();
  const lo = Math.min(toNum(digMin.value), toNum(digMax.value));
  const hi = Math.max(toNum(digMin.value), toNum(digMax.value));
  const minMedia = Math.max(0, toNum(minViewsMedia.value));

  state.filtered = state.raw.filter(d => {
    if (state.selectedLokasjoner.length &&
        !state.selectedLokasjoner.includes(d.lokasjon)) return false;

    if (state.selectedSerier.length) {
      if (!state.selectedSerier.some(s => d._serieArr.includes(s))) return false;
    }

    if (state.selectedTags.length) {
      if (!state.selectedTags.some(t => d._tagArr.includes(t))) return false;
    }

    if (d._digPct < lo || d._digPct > hi) return false;
    if (d.average_views_media < minMedia) return false;
    if (q && !d._searchLc.includes(q)) return false;

    return true;
  });

  sortFiltered();
  render();
}

function sortFiltered() {
  const dir = state.sortDir === "asc" ? 1 : -1;
  const key = state.sortKey;
  const col = columns.find(c => c.key === key);
  const numeric = !!col?.numeric;

  if (numeric) {
    state.filtered.sort((a, b) => (toNum(a[key]) - toNum(b[key])) * dir);
  } else {
    state.filtered.sort((a, b) => {
      const av = normalizeForSort(String(a[key] ?? ""));
      const bv = normalizeForSort(String(b[key] ?? ""));

      return av.localeCompare(bv, "en") * dir;
    });
  }

  updateHeaderIndicators();
}


function toggleSort(key, numeric) {
  if (state.sortKey === key) {
    state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
  } else {
    state.sortKey = key;
    state.sortDir = numeric ? "desc" : "asc";
  }
  sortFiltered();
  render();
}

/* =========================================================
   RENDER
========================================================= */

function buildTableHeader() {
  headEl.innerHTML = "";
  for (const c of columns) {
    const th = document.createElement("th");
    th.style.padding = "10px";
    th.style.cursor = "pointer";
    th.style.textAlign = c.numeric ? "right" : "left";
    th.dataset.key = c.key;
    th.onclick = () => toggleSort(c.key, !!c.numeric);
    headEl.appendChild(th);
  }
  updateHeaderIndicators();
}

function updateHeaderIndicators() {
  for (const th of headEl.children) {
    const key = th.dataset.key;
    const col = columns.find(c => c.key === key);
    const arrow = key === state.sortKey ? (state.sortDir === "asc" ? " ▲" : " ▼") : "";
    th.textContent = (col?.label ?? key) + arrow;
  }
}

function render() {
  renderStats();
  renderTable();
  renderPagination();
  updateTopScrollbarSpacer();
}

function renderStats() {
  statsEl.textContent =
    `Viser ${state.filtered.length.toLocaleString("no-NO")} av ${state.raw.length.toLocaleString("no-NO")} arkiver`;
}

function renderTable() {
  bodyEl.innerHTML = "";

  const start = (state.page - 1) * state.pageSize;
  const pageRows = state.filtered.slice(start, start + state.pageSize);

  if (!pageRows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = columns.length;
    td.style.padding = "14px";
    td.style.color = "#777";
    td.textContent = "Ingen treff.";
    tr.appendChild(td);
    bodyEl.appendChild(tr);
    return;
  }

  const frag = document.createDocumentFragment();

  for (const r of pageRows) {
    const tr = document.createElement("tr");
    tr.style.borderBottom = "1px solid #eee";

    for (const c of columns) {
      const td = document.createElement("td");
      td.style.padding = "10px";
      td.style.textAlign = c.numeric ? "right" : "left";

      let v = r[c.key];
      if (c.fmt) v = c.fmt(v);


      td.textContent = v ?? "";
      tr.appendChild(td);
    }
    frag.appendChild(tr);
  }

  bodyEl.appendChild(frag);
}

function renderPagination() {
  paginationEl.innerHTML = "";

  const totalPages = Math.ceil(state.filtered.length / state.pageSize);
  if (totalPages <= 1) return;

  paginationEl.append(
    pageBtn("◀ Forrige", state.page === 1, () => {
      state.page--;
      render();
    }),
    document.createTextNode(` Side ${state.page} / ${totalPages} `),
    pageBtn("Neste ▶", state.page >= totalPages, () => {
      state.page++;
      render();
    })
  );
}

/* =========================================================
   FLOATING SCROLLBAR SYNC
========================================================= */

function setupHorizontalScrollSync() {
  if (!scrollTopEl || !scrollTopSpacerEl || !scrollMainEl) return;

  let syncing = false;

  scrollTopEl.addEventListener("scroll", () => {
    if (syncing) return;
    syncing = true;
    scrollMainEl.scrollLeft = scrollTopEl.scrollLeft;
    syncing = false;
  });

  scrollMainEl.addEventListener("scroll", () => {
    if (syncing) return;
    syncing = true;
    scrollTopEl.scrollLeft = scrollMainEl.scrollLeft;
    syncing = false;
  });
}

function updateTopScrollbarSpacer() {
  if (!scrollTopSpacerEl || !scrollMainEl) return;
  const table = scrollMainEl.querySelector("table");
  if (!table) return;
  scrollTopSpacerEl.style.width = table.scrollWidth + "px";
}

/* =========================================================
   UTILS
========================================================= */

function pageBtn(txt, disabled, fn) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = txt;
  b.disabled = disabled;
  b.onclick = fn;
  return b;
}

function normalizeForSort(str) {
  if (!str) return "";

  return str
    .toLowerCase()
    // Treat Aa as A (modern UX expectation)
    .replace(/^aa/, "a")
    // Normalize diacritics (safe)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}


function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function int(v) {
  return Math.round(toNum(v)).toLocaleString("no-NO");
}

function num(v, d = 2) {
  return toNum(v).toFixed(d);
}

window.addEventListener("DOMContentLoaded", init);
