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

  // pagination
  page: 1,
  pageSize: 100,

  // sorting
  sortKey: "views_media",
  sortDir: "desc",

  // slicers
  selectedLokasjoner: [],
  selectedTags: []
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

/* =========================================================
   TABLE COLUMNS
========================================================= */

const columns = [
  { key: "navn", label: "Navn" },
  { key: "lokasjon", label: "Lokasjon" },
  { key: "identifikator", label: "Identifikator" },
  { key: "_digPct", label: "Digitalisert (%)", numeric: true, fmt: v => v.toFixed(2) },
  { key: "views_media", label: "Media-visninger", numeric: true, fmt: int },
  { key: "views_digark", label: "DigArk-visninger", numeric: true, fmt: int },
  { key: "average_views_media", label: "Gj.snitt Media", numeric: true, fmt: v => num(v, 2) },
  { key: "requisitions_ap", label: "Rekvisisjoner AP", numeric: true, fmt: int },
  { key: "tags", label: "Tags" }
];

/* =========================================================
   INIT
========================================================= */

init();

async function init() {
  buildTableHeader();

  const data = await fetchData();
  state.raw = normalizeRows(data);

  buildLokasjonDropdown();
  buildTagsDropdown();

  wireEvents();
  applyFilters();
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
    const tags = (r.tags ?? "").toString();
    const tagArr = tags
      .split(",")
      .map(t => t.trim())
      .filter(Boolean);

    return {
      ...r,

      // numbers
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

      // derived
      _tagArr: tagArr,
      _searchLc: `${r.navn ?? ""} ${r.identifikator ?? ""}`.toLowerCase()
    };
  });
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
  button.textContent = `${label} (Alle)`;

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
    const labelEl = document.createElement("label");
    labelEl.className = "option";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = opt;
    cb.checked = true;

    const span = document.createElement("span");
    span.textContent = opt;

    labelEl.append(cb, span);
    panel.appendChild(labelEl);
    checkboxes.push(cb);
  }

  function update() {
    const selected = checkboxes.filter(c => c.checked).map(c => c.value);
    const txt = selected.length === 0
      ? "Ingen"
      : selected.length === options.length
        ? "Alle"
        : `${selected.length} valgt`;

    button.textContent = `${label} (${txt})`;
    onChange(selected);
  }

  button.onclick = () => panel.classList.toggle("hidden");

  selectAllBtn.onclick = () => {
    checkboxes.forEach(c => c.checked = true);
    update();
  };

  clearBtn.onclick = () => {
    checkboxes.forEach(c => c.checked = false);
    update();
  };

  panel.addEventListener("change", update);

  document.addEventListener("click", e => {
    if (!wrapper.contains(e.target)) {
      panel.classList.add("hidden");
    }
  });

  wrapper.append(button, panel);
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
    onChange: vals => {
      state.selectedLokasjoner = vals;
      applyFilters();
    }
  });
}

function buildTagsDropdown() {
  const tagSet = new Set();
  for (const d of state.raw) {
    for (const t of d._tagArr) tagSet.add(t);
  }

  const opts = Array.from(tagSet).sort((a, b) => a.localeCompare(b, "no"));

  createMultiSelect({
    mountId: "tagsDropdown",
    label: "Tags",
    options: opts,
    onChange: vals => {
      state.selectedTags = vals;
      applyFilters();
    }
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

    // reset dropdowns by reinitializing page
    document.getElementById("lokasjonDropdown").innerHTML = "";
    document.getElementById("tagsDropdown").innerHTML = "";
    buildLokasjonDropdown();
    buildTagsDropdown();

    applyFilters();
  });
}

/* =========================================================
   FILTER / SORT
========================================================= */

function applyFilters() {
  state.page = 1;

  const searchQ = searchFilter.value.trim().toLowerCase();
  const lo = Math.min(toNum(digMin.value), toNum(digMax.value));
  const hi = Math.max(toNum(digMin.value), toNum(digMax.value));
  const minMedia = Math.max(0, toNum(minViewsMedia.value));

  state.filtered = state.raw.filter(d => {
    if (state.selectedLokasjoner.length &&
        !state.selectedLokasjoner.includes(d.lokasjon)) return false;

    if (state.selectedTags.length) {
      let ok = false;
      for (const t of state.selectedTags) {
        if (d._tagArr.includes(t)) { ok = true; break; }
      }
      if (!ok) return false;
    }

    if (d._digPct < lo || d._digPct > hi) return false;
    if (d.average_views_media < minMedia) return false;
    if (searchQ && !d._searchLc.includes(searchQ)) return false;

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
    state.filtered.sort((a, b) =>
      String(a[key] ?? "").localeCompare(String(b[key] ?? ""), "no") * dir
    );
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
