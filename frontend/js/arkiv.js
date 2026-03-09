/* =========================================================
   CONFIG
========================================================= */

const API_BASE =
  "https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net";

const SERIE_PAGE = "/views/serie_hierarchy.html";
const DETAILS_PAGE = "/views/arkiv_details.html";

/** Read query-string param */
function getUrlParam(name) {
  const v = new URLSearchParams(window.location.search).get(name);
  return v ? v.trim() : "";
}

/** Navigate to serie page with arkiv filter */
function gotoSerieForArkivIdent(arkivIdent) {
  if (!arkivIdent) return;
  const url = `${SERIE_PAGE}?arkiv=${encodeURIComponent(arkivIdent)}`;
  window.location.assign(url);
}

/** Navigate to details page for arkiv_sk and preferred line-kind */
function gotoDetailsForArkivSk(arkivSk, ident, kind) {
  if (!arkivSk) return;
  const url =
    `${DETAILS_PAGE}?arkiv_sk=${encodeURIComponent(arkivSk)}` +
    `&ident=${encodeURIComponent(ident ?? "")}` +
    `&kind=${encodeURIComponent(kind ?? "")}`;
  window.location.assign(url);
}

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
  selectedSerier: [],

  // optional: highlight a selected arkiv identifikator from query param
  highlightArkiv: ""
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

const DASTATS_DETAILS_PAGE = "/views/arkiv_dastats_details.html";

function gotoDastatsDetailsForArkivSk(arkivSk, ident, kind) {
  if (!arkivSk) return;
  const url =
    `${DASTATS_DETAILS_PAGE}?arkiv_sk=${encodeURIComponent(arkivSk)}` +
    `&ident=${encodeURIComponent(ident ?? "")}` +
    `&kind=${encodeURIComponent(kind ?? "")}`;
  window.location.assign(url);
}

/* =========================================================
   TABLE COLUMNS
========================================================= */

function pillButtonHtml(text, title) {
  const safe = String(text ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `
    <button
      type="button"
      class="nav-pill"
      title="${title ? String(title).replace(/"/g, "&quot;") : ""}"
      style="
        display:inline-flex;align-items:center;gap:8px;
        border:1px solid #cbd5e1;border-radius:999px;
        padding:4px 10px;background:#0f172a;color:#fff;
        font-weight:700;font-size:12px;line-height:1;
        cursor:pointer;
      "
      data-pill="${safe}"
    >
      <span style="width:7px;height:7px;border-radius:50%;background:#fdd835;display:inline-block;"></span>
      ${safe}
      <span style="opacity:.85;font-weight:600;">→</span>
    </button>
  `;
}

function reqLinkHtml(value, arkivSk, ident, kind) {
  const n = Math.round(toNum(value));
  const formatted = n.toLocaleString("no-NO");

  // If we don't know arkiv_sk, just show the number
  if (!arkivSk) return formatted;

  const safeSk = String(arkivSk).replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeIdent = String(ident ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeKind = String(kind ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return `
    <button
      type="button"
      class="req-link"
      data-arkiv-sk="${safeSk}"
      data-ident="${safeIdent}"
      data-kind="${safeKind}"
      title="Vis rekvisisjonshistorikk (${safeKind})"
      style="
        background:transparent;border:none;padding:0;margin:0;
        color:#0f172a;font-weight:700;cursor:pointer;
        text-decoration:underline;
      "
    >${formatted}</button>
  `;
}

function viewsLinkHtml(value, arkivSk, ident, kind) {
  const n = Math.round(toNum(value));
  const formatted = n.toLocaleString("no-NO");
  if (!arkivSk) return formatted;

  const safeSk = String(arkivSk).replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeIdent = String(ident ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeKind = String(kind ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return `
    <button
      type="button"
      class="views-link"
      data-arkiv-sk="${safeSk}"
      data-ident="${safeIdent}"
      data-kind="${safeKind}"
      title="Vis DAstats historikk (${safeKind})"
      style="
        background:transparent;border:none;padding:0;margin:0;
        color:#0f172a;font-weight:700;cursor:pointer;
        text-decoration:underline;
      "
    >${formatted}</button>
  `;
}

const columns = [
  { key: "navn", label: "Navn" },
  { key: "lokasjon", label: "Lokasjon" },

  // ✅ clickable pill on identifikator → go to serie page filtered by arkiv
  {
    key: "identifikator",
    label: "Identifikator",
    render: (row) => {
      const ident = row.identifikator ?? "";
      if (!ident) return "";
      return {
        type: "html",
        html: pillButtonHtml(ident, `Vis serier for arkiv: ${ident}`)
      };
    }
  },

  { key: "_digPct", label: "Digitalisert (%)", numeric: true, fmt: v => v.toFixed(2) },

  { key: "stykke_count", label: "Stykke", numeric: true, fmt: int },
  { key: "views_internal", label: "Visninger (Intern)", numeric: true, fmt: int },
  {
    key: "views_media",
    label: "Visninger (Media)",
    numeric: true,
    render: (row) => ({
      type: "html",
      html: viewsLinkHtml(row.views_media, row.arkiv_sk, row.identifikator, "media")
    })
  },
  {
    key: "views_digark",
    label: "Visninger (DigArk)",
    numeric: true,
    render: (row) => ({
      type: "html",
      html: viewsLinkHtml(row.views_digark, row.arkiv_sk, row.identifikator, "digark")
    })
  },

  { key: "topdesk_references", label: "Topdesk refs", numeric: true, fmt: int },

  { key: "average_views_media", label: "Gj.snitt Media", numeric: true, fmt: v => num(v, 2) },
  { key: "average_views_digark", label: "Gj.snitt DigArk", numeric: true, fmt: v => num(v, 2) },

  // ✅ CLICKABLE numbers → details page, with preferred kind
  {
    key: "requisitions_internal",
    label: "Rekvisisjoner (Intern)",
    numeric: true,
    render: (row) => ({
      type: "html",
      html: reqLinkHtml(row.requisitions_internal, row.arkiv_sk, row.identifikator, "internal")
    })
  },
  {
    key: "requisitions_ap",
    label: "Rekvisisjoner (AP)",
    numeric: true,
    render: (row) => ({
      type: "html",
      html: reqLinkHtml(row.requisitions_ap, row.arkiv_sk, row.identifikator, "ap")
    })
  },

  { key: "serier", label: "Hovedserier" },
  { key: "tags", label: "Tags" }
];

/* =========================================================
   INIT
========================================================= */

async function init() {
  showLoading();

  try {
    // If we came from serie page: /views/arkiv.html?arkiv=SAT-A-1353
    state.highlightArkiv = getUrlParam("arkiv");

    buildTableHeader();

    const data = await fetchData();
    state.raw = normalizeRows(data);

    buildLokasjonDropdown();
    buildTagsDropdown();
    buildSerierDropdown();

    wireEvents();

    // Apply incoming filter (if any)
    if (state.highlightArkiv && searchFilter) {
      searchFilter.value = state.highlightArkiv;
    }

    applyFilters();
    setupHorizontalScrollSync();
    updateTopScrollbarSpacer();
  } catch (err) {
    console.error(err);
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
   MULTI-SELECT DROPDOWNS (Arkiv’s own implementation)
========================================================= */

function createMultiSelect({ mountId, label, options, onChange }) {
  const mount = document.getElementById(mountId);
  if (!mount) return;

  mount.innerHTML = "";

  const wrapper = document.createElement("div");
  wrapper.className = "multi-select";

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = `${label}: (alle)`;

  const panel = document.createElement("div");
  panel.className = "panel hidden";

  const controls = document.createElement("div");
  controls.className = "controls";

  const selectAllBtn = document.createElement("button");
  selectAllBtn.type = "button";
  selectAllBtn.textContent = "Alle";

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.textContent = "Ingen";

  controls.append(selectAllBtn, clearBtn);

  const list = document.createElement("div");

  const selected = new Set();

  function updateButtonText() {
    if (!selected.size) button.textContent = `${label}: (alle)`;
    else if (selected.size === 1) button.textContent = `${label}: ${[...selected][0]}`;
    else button.textContent = `${label}: ${selected.size} valgt`;
  }

  function emitChange() {
    onChange([...selected]);
  }

  function rebuild() {
    list.innerHTML = "";
    for (const opt of options) {
      const row = document.createElement("label");
      row.className = "option";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = selected.has(opt);

      cb.addEventListener("change", () => {
        if (cb.checked) selected.add(opt);
        else selected.delete(opt);
        updateButtonText();
        emitChange();
      });

      const span = document.createElement("span");
      span.textContent = opt;

      row.append(cb, span);
      list.appendChild(row);
    }
  }

  button.addEventListener("click", () => panel.classList.toggle("hidden"));
  document.addEventListener("mousedown", (e) => {
    if (!wrapper.contains(e.target)) panel.classList.add("hidden");
  });

  selectAllBtn.addEventListener("click", () => {
    selected.clear();
    for (const opt of options) selected.add(opt);
    rebuild();
    updateButtonText();
    emitChange();
  });

  clearBtn.addEventListener("click", () => {
    selected.clear();
    rebuild();
    updateButtonText();
    emitChange();
  });

  panel.append(controls, list);
  wrapper.append(button, panel);
  mount.appendChild(wrapper);

  rebuild();
  updateButtonText();
}

function buildLokasjonDropdown() {
  const values = uniq(state.raw.map(r => r.lokasjon)).sort((a, b) => a.localeCompare(b, "no"));
  createMultiSelect({
    mountId: "lokasjonDropdown",
    label: "Lokasjon",
    options: values,
    onChange: (vals) => {
      state.selectedLokasjoner = vals;
      state.page = 1;
      applyFilters();
    }
  });
}

function buildTagsDropdown() {
  const values = uniq(state.raw.flatMap(r => r._tagArr)).sort((a, b) => a.localeCompare(b, "no"));
  createMultiSelect({
    mountId: "tagsDropdown",
    label: "Tags",
    options: values,
    onChange: (vals) => {
      state.selectedTags = vals;
      state.page = 1;
      applyFilters();
    }
  });
}

function buildSerierDropdown() {
  const values = uniq(state.raw.flatMap(r => r._serieArr)).sort((a, b) => a.localeCompare(b, "no"));
  createMultiSelect({
    mountId: "serierDropdown",
    label: "Hovedserier",
    options: values,
    onChange: (vals) => {
      state.selectedSerier = vals;
      state.page = 1;
      applyFilters();
    }
  });
}

/* =========================================================
   FILTERING
========================================================= */

function applyFilters() {
  const q = (searchFilter?.value ?? "").trim().toLowerCase();

  const minD = toNum(digMin?.value);
  const maxD = toNum(digMax?.value);
  const minMedia = toNum(minViewsMedia?.value);

  const lokSet = new Set(state.selectedLokasjoner);
  const tagSet = new Set(state.selectedTags);
  const serieSet = new Set(state.selectedSerier);

  state.filtered = state.raw.filter(d => {
    if (d._digPct < minD || d._digPct > maxD) return false;
    if (d.average_views_media < minMedia) return false;
    if (q && !d._searchLc.includes(q)) return false;

    if (lokSet.size && !lokSet.has(d.lokasjon)) return false;

    if (tagSet.size) {
      const has = d._tagArr?.some(t => tagSet.has(t));
      if (!has) return false;
    }

    if (serieSet.size) {
      const has = d._serieArr?.some(s => serieSet.has(s));
      if (!has) return false;
    }

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

    // highlight if this row matches the incoming arkiv param
    if (state.highlightArkiv && r.identifikator === state.highlightArkiv) {
      tr.style.outline = "2px solid #fdd835";
      tr.style.outlineOffset = "-2px";
      tr.style.background = "#fffbea";
    }

    for (const c of columns) {
      const td = document.createElement("td");
      td.style.padding = "10px";
      td.style.textAlign = c.numeric ? "right" : "left";

      if (typeof c.render === "function") {
        const out = c.render(r);
        if (out && out.type === "html") {
          td.innerHTML = out.html || "";
          // keep numeric alignment for numeric columns
          td.style.textAlign = c.numeric ? "right" : "left";

          // click handler for pill navigation (identifikator)
          const pillBtn = td.querySelector("button.nav-pill");
          if (pillBtn) {
            pillBtn.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              gotoSerieForArkivIdent(r.identifikator);
            });
          }

          // click handler for requisition numbers -> details page
          const reqBtn = td.querySelector("button.req-link");
          if (reqBtn) {
            reqBtn.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();

              const sk = reqBtn.dataset.arkivSk;
              const ident = reqBtn.dataset.ident || "";
              const kind = reqBtn.dataset.kind || ""; // "internal" | "ap"

              gotoDetailsForArkivSk(sk, ident, kind);
            });

            // click handler for views numbers -> dastats details page
          const viewsBtn = td.querySelector("button.views-link");
          if (viewsBtn) {
            viewsBtn.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();

              const sk = viewsBtn.dataset.arkivSk;
              const ident = viewsBtn.dataset.ident || "";
              const kind = viewsBtn.dataset.kind || ""; // "media" | "digark"
              gotoDastatsDetailsForArkivSk(sk, ident, kind);
            });
          }
          }
        } else {
          td.textContent = out ?? "";
        }
      } else {
        let v = r[c.key];
        if (c.fmt) v = c.fmt(v);
        td.textContent = v ?? "";
      }

      tr.appendChild(td);
    }

    frag.appendChild(tr);
  }

  bodyEl.appendChild(frag);

  // If we came here from series page, try to scroll near the highlighted row
  if (state.highlightArkiv) {
    requestAnimationFrame(() => {
      const firstHighlighted = bodyEl.querySelector("tr[style*='outline']");
      if (firstHighlighted) firstHighlighted.scrollIntoView({ block: "center" });
    });
  }
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
   EVENTS
========================================================= */

function wireEvents() {
  const onAnyChange = debounce(() => {
    state.page = 1;
    applyFilters();
  }, 200);

  searchFilter?.addEventListener("input", onAnyChange);
  digMin?.addEventListener("input", onAnyChange);
  digMax?.addEventListener("input", onAnyChange);
  minViewsMedia?.addEventListener("input", onAnyChange);

  resetBtn?.addEventListener("click", () => {
    if (searchFilter) searchFilter.value = "";
    if (digMin) digMin.value = "0";
    if (digMax) digMax.value = "100";
    if (minViewsMedia) minViewsMedia.value = "0";

    state.selectedLokasjoner = [];
    state.selectedTags = [];
    state.selectedSerier = [];
    state.highlightArkiv = "";

    state.sortKey = "views_media";
    state.sortDir = "desc";
    state.page = 1;

    applyFilters();
  });

  window.addEventListener("resize", debounce(updateTopScrollbarSpacer, 150));
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
    .replace(/^aa/, "a")
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

function uniq(arr) {
  return [...new Set(arr.filter(Boolean))];
}

window.addEventListener("DOMContentLoaded", init);