const API_BASE = "https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net";

const state = {
  page: 1,
  pageSize: 100,
  total: 0,
  items: [],

  sortKey: "startaar",
  sortDir: "asc",

  q: "",
  identifikator: "",
  startaarFrom: "",
  startaarTo: "",
  sluttaarFrom: "",
  sluttaarTo: "",
  tags: "" // comma-separated string
};

const columns = [
  { key: "navn", label: "Navn" },
  { key: "identifikator", label: "Identifikator" },
  { key: "path", label: "Path" },
  { key: "startaar", label: "Startår", numeric: true },
  { key: "sluttaar", label: "Sluttår", numeric: true },
  { key: "stykke_count", label: "Stykke", numeric: true },
  { key: "hyllemeter", label: "Hyllemeter", numeric: true },
  { key: "predicted_tags", label: "Tags" }
];

const el = {
  q: document.getElementById("q"),
  identifikator: document.getElementById("identifikator"),
  startaarFrom: document.getElementById("startaarFrom"),
  startaarTo: document.getElementById("startaarTo"),
  sluttaarFrom: document.getElementById("sluttaarFrom"),
  sluttaarTo: document.getElementById("sluttaarTo"),
  tags: document.getElementById("tags"),

  resetBtn: document.getElementById("resetBtn"),
  stats: document.getElementById("stats"),

  head: document.getElementById("tableHead"),
  body: document.getElementById("tableBody"),
  pagination: document.getElementById("pagination"),

  scrollTop: document.getElementById("tableScrollTop"),
  scrollTopSpacer: document.getElementById("tableScrollTopSpacer"),
  scrollMain: document.getElementById("tableScrollMain"),

  loading: document.getElementById("loadingOverlay")
};

function showLoading() { if (el.loading) el.loading.style.display = "flex"; }
function hideLoading() { if (el.loading) el.loading.style.display = "none"; }

function qs(params) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s === "") continue;
    u.set(k, s);
  }
  return u.toString();
}

async function fetchPage() {
  showLoading();
  try {
    const query = qs({
      page: state.page,
      page_size: state.pageSize,
      sort_key: state.sortKey,
      sort_dir: state.sortDir,
      q: state.q,
      identifikator: state.identifikator,
      startaar_from: state.startaarFrom,
      startaar_to: state.startaarTo,
      sluttaar_from: state.sluttaarFrom,
      sluttaar_to: state.sluttaarTo,
      tags: state.tags
    });

    const res = await fetch(`${API_BASE}/api/serie-hierarchy?${query}`);
    if (!res.ok) throw new Error(`API error ${res.status}`);

    const data = await res.json();
    if (data.error) throw new Error(data.error);

    state.total = data.total ?? 0;
    state.items = data.items ?? [];
    render();
  } finally {
    hideLoading();
  }
}

function buildHeader() {
  el.head.innerHTML = "";
  for (const c of columns) {
    const th = document.createElement("th");
    th.style.padding = "10px";
    th.style.cursor = "pointer";
    th.style.textAlign = c.numeric ? "right" : "left";
    th.dataset.key = c.key;

    th.onclick = () => toggleSort(c.key, !!c.numeric);
    el.head.appendChild(th);
  }
  updateHeaderIndicators();
}

function updateHeaderIndicators() {
  for (const th of el.head.children) {
    const key = th.dataset.key;
    const col = columns.find(c => c.key === key);
    const arrow = key === state.sortKey ? (state.sortDir === "asc" ? " ▲" : " ▼") : "";
    th.textContent = (col?.label ?? key) + arrow;
  }
}

function toggleSort(key, numeric) {
  if (state.sortKey === key) {
    state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
  } else {
    state.sortKey = key;
    state.sortDir = numeric ? "desc" : "asc";
  }
  updateHeaderIndicators();
  state.page = 1;
  fetchPage();
}

function render() {
  // stats
  const start = (state.page - 1) * state.pageSize + 1;
  const end = Math.min(state.page * state.pageSize, state.total);
  el.stats.textContent = state.total
    ? `Viser ${start.toLocaleString("no-NO")}–${end.toLocaleString("no-NO")} av ${state.total.toLocaleString("no-NO")} rader`
    : "Ingen treff.";

  // table
  el.body.innerHTML = "";
  if (!state.items.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = columns.length;
    td.style.padding = "14px";
    td.style.color = "#777";
    td.textContent = "Ingen treff.";
    tr.appendChild(td);
    el.body.appendChild(tr);
  } else {
    const frag = document.createDocumentFragment();
    for (const r of state.items) {
      const tr = document.createElement("tr");
      tr.style.borderBottom = "1px solid #eee";

      for (const c of columns) {
        const td = document.createElement("td");
        td.style.padding = "10px";
        td.style.textAlign = c.numeric ? "right" : "left";
        const v = r[c.key];
        td.textContent = (v === null || v === undefined) ? "" : String(v);
        tr.appendChild(td);
      }
      frag.appendChild(tr);
    }
    el.body.appendChild(frag);
  }

  // pagination
  renderPagination();
  updateTopScrollbarSpacer();
}

function pageBtn(txt, disabled, fn) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = txt;
  b.disabled = disabled;
  b.onclick = fn;
  return b;
}

function renderPagination() {
  el.pagination.innerHTML = "";
  const totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
  if (totalPages <= 1) return;

  el.pagination.append(
    pageBtn("◀ Forrige", state.page === 1, () => { state.page--; fetchPage(); }),
    document.createTextNode(` Side ${state.page} / ${totalPages} `),
    pageBtn("Neste ▶", state.page >= totalPages, () => { state.page++; fetchPage(); })
  );
}

function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

/* Horizontal scroll sync (same as your existing Arkiv page) */
function setupHorizontalScrollSync() {
  if (!el.scrollTop || !el.scrollTopSpacer || !el.scrollMain) return;

  let syncing = false;

  el.scrollTop.addEventListener("scroll", () => {
    if (syncing) return;
    syncing = true;
    el.scrollMain.scrollLeft = el.scrollTop.scrollLeft;
    syncing = false;
  });

  el.scrollMain.addEventListener("scroll", () => {
    if (syncing) return;
    syncing = true;
    el.scrollTop.scrollLeft = el.scrollMain.scrollLeft;
    syncing = false;
  });
}

function updateTopScrollbarSpacer() {
  if (!el.scrollTopSpacer || !el.scrollMain) return;
  const table = el.scrollMain.querySelector("table");
  if (!table) return;
  el.scrollTopSpacer.style.width = table.scrollWidth + "px";
}

function wireEvents() {
  const onChange = debounce(() => {
    state.page = 1;
    state.q = el.q.value;
    state.identifikator = el.identifikator.value;
    state.startaarFrom = el.startaarFrom.value;
    state.startaarTo = el.startaarTo.value;
    state.sluttaarFrom = el.sluttaarFrom.value;
    state.sluttaarTo = el.sluttaarTo.value;
    state.tags = el.tags.value;
    fetchPage();
  }, 200);

  el.q.addEventListener("input", onChange);
  el.identifikator.addEventListener("input", onChange);
  el.startaarFrom.addEventListener("input", onChange);
  el.startaarTo.addEventListener("input", onChange);
  el.sluttaarFrom.addEventListener("input", onChange);
  el.sluttaarTo.addEventListener("input", onChange);
  el.tags.addEventListener("input", onChange);

  el.resetBtn.addEventListener("click", () => {
    el.q.value = "";
    el.identifikator.value = "";
    el.startaarFrom.value = "";
    el.startaarTo.value = "";
    el.sluttaarFrom.value = "";
    el.sluttaarTo.value = "";
    el.tags.value = "";

    state.sortKey = "startaar";
    state.sortDir = "asc";
    state.page = 1;

    onChange();
  });

  window.addEventListener("resize", debounce(updateTopScrollbarSpacer, 150));
}

async function init() {
  buildHeader();
  setupHorizontalScrollSync();
  wireEvents();
  await fetchPage();
}

window.addEventListener("DOMContentLoaded", init);
