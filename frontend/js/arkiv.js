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
const tagsFilter = document.getElementById("tagsFilter");
const tagsClearBtn = document.getElementById("tagsClearBtn");
const tagsCountEl = document.getElementById("tagsCount");

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
  { key: "views_media", label: "Media-visninger", numeric: true, fmt: v => int(v) },
  { key: "views_digark", label: "DigArk-visninger", numeric: true, fmt: v => int(v) },
  { key: "average_views_media", label: "Gj.snitt Media", numeric: true, fmt: v => num(v, 2) },
  { key: "requisitions_ap", label: "Rekvisisjoner AP", numeric: true, fmt: v => int(v) },
  { key: "tags", label: "Tags" }
];

/* ========= INIT ========= */
init();

async function init() {
  buildHeader();
  wireEvents();

  const data = await fetchData();
  state.raw = normalize(data);

  populateLokasjon();
  populateTags();     // ✅ build multi-select options once
  applyFilters();     // initial render
}

/* ========= DATA ========= */
async function fetchData() {
  const res = await fetch(`${API_BASE}/api/arkiv-overview`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return await res.json();
}

function normalize(rows) {
  return rows.map(r => {
    const tags = (r.tags ?? "").toString();
    const tagArr = tags
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    return {
      ...r,

      // numeric normalization
      views_media: toNum(r.views_media),
      views_digark: toNum(r.views_digark),
      average_views_media: toNum(r.average_views_media),
      requisitions_ap: toNum(r.requisitions_ap),
      _digPct: toNum(r.percentage_digitized) * 100,

      // strings
      navn: (r.navn ?? "").toString(),
      lokasjon: (r.lokasjon ?? "").toString(),
      identifikator: (r.identifikator ?? "").toString(),
      tags,

      // 🚀 derived fields
      _tagArr: tagArr, // array of clean tags (fast membership checks)
      _searchLc: `${r.navn ?? ""} ${r.identifikator ?? ""}`.toLowerCase()
    };
  });
}

/* ========= UI BUILDERS ========= */
function buildHeader() {
  headEl.innerHTML = "";
  for (const c of columns) {
    const th = document.createElement("th");
    th.style.cursor = "pointer";
    th.style.padding = "10px";
    th.style.userSelect = "none";
    th.style.textAlign = c.numeric ? "right" : "left";
    th.dataset.key = c.key;
    th.onclick = () => toggleSort(c.key, !!c.numeric);
    headEl.appendChild(th);
  }
  updateHeaderIndicators();
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

function populateTags() {
  // Gather all unique tags across the dataset
  const tagSet = new Set();
  for (const d of state.raw) {
    for (const t of d._tagArr) tagSet.add(t);
  }

  const tags = Array.from(tagSet).sort((a, b) => a.localeCompare(b, "no"));

  tagsFilter.innerHTML = "";
  for (const t of tags) {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    tagsFilter.appendChild(opt);
  }

  updateTagsCount();
}

/* ========= EVENTS ========= */
function wireEvents() {
  const debounced = debounce(applyFilters, 140);

  // input/change (multi-select uses "change")
  lokasjonFilter.addEventListener("change", debounced);
  tagsFilter.addEventListener("change", applyFilters); // immediate is fine
  searchFilter.addEventListener("input", debounced);
  digMin.addEventListener("input", debounced);
  digMax.addEventListener("input", debounced);
  minViewsMedia.addEventListener("input", debounced);

  tagsClearBtn.addEventListener("click", () => {
    for (const opt of tagsFilter.options) opt.selected = false;
    applyFilters();
  });

  resetBtn.addEventListener("click", () => {
    lokasjonFilter.value = "ALL";
    for (const opt of tagsFilter.options) opt.selected = false;
    searchFilter.value = "";
    digMin.value = 0;
    digMax.value = 100;
    minViewsMedia.value = 0;
    state.sortKey = "views_media";
    state.sortDir = "desc";
    applyFilters();
  });
}

/* ========= FILTERING ========= */
function applyFilters() {
  state.page = 1;

  const loc = lokasjonFilter.value;
  const searchQ = searchFilter.value.trim().toLowerCase();

  const lo = Math.min(toNum(digMin.value), toNum(digMax.value));
  const hi = Math.max(toNum(digMin.value), toNum(digMax.value));
  const minMedia = Math.max(0, toNum(minViewsMedia.value));

  // Selected tags
  const selectedTags = getSelectedValues(tagsFilter); // array
  const tagMode = "ANY"; // switch to "ALL" if you want stricter matching

  state.filtered = state.raw.filter(d => {
    if (loc !== "ALL" && d.lokasjon !== loc) return false;

    if (d._digPct < lo || d._digPct > hi) return false;

    if (d.average_views_media < minMedia) return false;

    if (searchQ && !d._searchLc.includes(searchQ)) return false;

    if (selectedTags.length) {
      if (tagMode === "ANY") {
        // any selected tag must exist in row tags
        let ok = false;
        for (const t of selectedTags) {
          if (d._tagArr.includes(t)) { ok = true; break; }
        }
        if (!ok) return false;
      } else {
        // ALL selected tags must exist
        for (const t of selectedTags) {
          if (!d._tagArr.includes(t)) return false;
        }
      }
    }

    return true;
  });

  sort();
  updateTagsCount();
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

  // Faster: precompute whether numeric
  const col = columns.find(c => c.key === key);
  const numeric = !!col?.numeric;

  if (numeric) {
    state.filtered.sort((a, b) => (toNum(a[key]) - toNum(b[key])) * dir);
  } else {
    state.filtered.sort((a, b) => String(a[key] ?? "").localeCompare(String(b[key] ?? ""), "no") * dir);
  }

  updateHeaderIndicators();
}

function updateHeaderIndicators() {
  for (const th of headEl.querySelectorAll("th")) {
    const key = th.dataset.key;
    const col = columns.find(c => c.key === key);
    const arrow = key === state.sortKey ? (state.sortDir === "asc" ? " ▲" : " ▼") : "";
    th.textContent = (col?.label ?? key) + arrow;
  }
}

/* ========= RENDER ========= */
function render() {
  renderStats();
  renderTable();
  renderPagination();
}

function renderStats() {
  const total = state.raw.length;
  const shown = state.filtered.length;
  statsEl.textContent = `Viser ${shown.toLocaleString("no-NO")} av ${total.toLocaleString("no-NO")} arkiver`;
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

  // Use a DocumentFragment to reduce reflow
  const frag = document.createDocumentFragment();

  for (const r of pageRows) {
    const tr = document.createElement("tr");
    tr.style.borderBottom = "1px solid #f0f0f0";

    for (const c of columns) {
      const td = document.createElement("td");
      td.style.padding = "10px";
      td.style.textAlign = c.numeric ? "right" : "left";

      let v = r[c.key];
      if (c.fmt) v = c.fmt(v);

      if (c.key === "tags") {
        td.style.maxWidth = "520px";
        td.style.whiteSpace = "normal";
        td.style.lineHeight = "1.2";
      }

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

  const prev = btn("◀ Forrige", state.page === 1, () => {
    state.page--;
    render();
  });

  const next = btn("Neste ▶", state.page >= totalPages, () => {
    state.page++;
    render();
  });

  const info = document.createElement("span");
  info.textContent = `Side ${state.page} / ${totalPages}`;

  const size = document.createElement("select");
  [50, 100, 200, 500].forEach(n => {
    const o = document.createElement("option");
    o.value = String(n);
    o.textContent = `${n} / side`;
    if (n === state.pageSize) o.selected = true;
    size.appendChild(o);
  });
  size.onchange = () => {
    state.pageSize = parseInt(size.value, 10);
    state.page = 1;
    render();
  };

  paginationEl.append(prev, info, next, size);
}

function updateTagsCount() {
  const selected = getSelectedValues(tagsFilter);
  tagsCountEl.textContent = selected.length ? `${selected.length} valgt` : "Ingen valgt";
}

function btn(txt, disabled, fn) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = txt;
  b.disabled = disabled;
  b.onclick = fn;
  return b;
}

/* ========= UTILS ========= */
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

function getSelectedValues(selectEl) {
  const out = [];
  for (const opt of selectEl.options) {
    if (opt.selected) out.push(opt.value);
  }
  return out;
}

function int(v) {
  return Math.round(toNum(v)).toLocaleString("no-NO");
}

function num(v, decimals = 2) {
  return toNum(v).toFixed(decimals);
}
