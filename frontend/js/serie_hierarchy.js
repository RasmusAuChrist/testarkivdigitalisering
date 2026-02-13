const API_BASE = "https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net";

const state = {
  page: 1,
  pageSize: 100,
  total: 0,
  items: [],

  sortKey: "startaar",
  sortDir: "asc",

  q: "",
  startaarFrom: "",
  startaarTo: "",
  sluttaarFrom: "",
  sluttaarTo: "",

  // ✅ multi-select values
  orderNos: [],
  navnValues: [],
  identValues: [],
  tagValues: [],
};

const columns = [
  { key: "navn", label: "Navn" },
  { key: "identifikator", label: "Identifikator" },
  { key: "path", label: "Path" },
  { key: "order_no", label: "Order", numeric: true },
  { key: "startaar", label: "Startår", numeric: true },
  { key: "sluttaar", label: "Sluttår", numeric: true },
  { key: "stykke_count", label: "Stykke", numeric: true },
  { key: "hyllemeter", label: "Hyllemeter", numeric: true },
  { key: "predicted_tags", label: "Tags" }
];

const el = {
  q: document.getElementById("q"),
  startaarFrom: document.getElementById("startaarFrom"),
  startaarTo: document.getElementById("startaarTo"),
  sluttaarFrom: document.getElementById("sluttaarFrom"),
  sluttaarTo: document.getElementById("sluttaarTo"),

  resetBtn: document.getElementById("resetBtn"),
  stats: document.getElementById("stats"),

  head: document.getElementById("tableHead"),
  body: document.getElementById("tableBody"),
  pagination: document.getElementById("pagination"),

  scrollTop: document.getElementById("tableScrollTop"),
  scrollTopSpacer: document.getElementById("tableScrollTopSpacer"),
  scrollMain: document.getElementById("tableScrollMain"),

  loading: document.getElementById("loadingOverlay"),

  msOrder: document.getElementById("msOrder"),
  msNavn: document.getElementById("msNavn"),
  msIdent: document.getElementById("msIdent"),
  msTags: document.getElementById("msTags"),
};

function showLoading() { if (el.loading) el.loading.style.display = "flex"; }
function hideLoading() { if (el.loading) el.loading.style.display = "none"; }

function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

function qs(params) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) {
      const s = v.filter(x => String(x).trim() !== "").join(",");
      if (s) u.set(k, s);
      continue;
    }
    const s = String(v).trim();
    if (s === "") continue;
    u.set(k, s);
  }
  return u.toString();
}

/**
 * ✅ MultiSelect dropdown with async suggestions
 * Requires backend endpoints:
 *   GET /api/serie-hierarchy/suggest/<field>?q=...&limit=20
 * Returns: { items: ["...", "..."] }
 */
class MultiSelect {
  constructor(root, opts) {
    this.root = root;
    this.input = root.querySelector("input");
    this.menu = root.querySelector(".ms-menu");
    this.getSelected = opts.getSelected;
    this.setSelected = opts.setSelected;
    this.fetchItems = opts.fetchItems; // (q) => Promise<string[]>
    this.placeholder = this.input.placeholder || "";
    this.maxSelected = opts.maxSelected ?? 50;

    this._open = false;
    this._lastResults = [];

    this._wire();
    this.renderChips();
  }

  _wire() {
    // Click root focuses input
    this.root.addEventListener("mousedown", (e) => {
      if (e.target === this.root) {
        e.preventDefault();
        this.input.focus();
      }
    });

    // Input typing triggers suggestion fetch
    this.input.addEventListener("input", debounce(async () => {
      const q = this.input.value.trim();
      if (!q) {
        this.closeMenu();
        return;
      }
      await this.showSuggestions(q);
    }, 200));

    this.input.addEventListener("focus", async () => {
      const q = this.input.value.trim();
      if (q) await this.showSuggestions(q);
    });

    // ESC closes
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.closeMenu();
    });

    // Click outside closes
    document.addEventListener("mousedown", (e) => {
      if (!this.root.contains(e.target)) this.closeMenu();
    });
  }

  async showSuggestions(q) {
    const selected = new Set(this.getSelected().map(String));
    this.menu.innerHTML = `<div class="ms-muted">Laster…</div>`;
    this.openMenu();

    try {
      const items = await this.fetchItems(q);
      this._lastResults = items;

      const filtered = items.filter(v => !selected.has(String(v)));
      if (!filtered.length) {
        this.menu.innerHTML = `<div class="ms-muted">Ingen forslag.</div>`;
        return;
      }

      this.menu.innerHTML = "";
      for (const v of filtered) {
        const div = document.createElement("div");
        div.className = "ms-item";
        div.textContent = v;
        div.addEventListener("mousedown", (e) => {
          e.preventDefault(); // prevent input blur
          this.add(v);
        });
        this.menu.appendChild(div);
      }
    } catch (err) {
      this.menu.innerHTML = `<div class="ms-muted">Feil ved lasting av forslag.</div>`;
      console.error(err);
    }
  }

  add(value) {
    const v = String(value).trim();
    if (!v) return;

    const cur = this.getSelected().map(String);
    if (cur.includes(v)) return;

    if (cur.length >= this.maxSelected) return;

    this.setSelected([...cur, v]);
    this.input.value = "";
    this.closeMenu();
    this.renderChips();
    this.onChange?.();
  }

  remove(value) {
    const v = String(value);
    const cur = this.getSelected().map(String);
    this.setSelected(cur.filter(x => x !== v));
    this.renderChips();
    this.onChange?.();
  }

  clear() {
    this.setSelected([]);
    this.input.value = "";
    this.closeMenu();
    this.renderChips();
    this.onChange?.();
  }

  renderChips() {
    // remove existing chips (keep input + menu)
    const chips = Array.from(this.root.querySelectorAll(".chip"));
    for (const c of chips) c.remove();

    const selected = this.getSelected().map(String);

    for (const v of selected) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = v;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "×";
      btn.title = "Fjern";
      btn.addEventListener("click", () => this.remove(v));

      chip.appendChild(btn);
      // insert chip before input
      this.root.insertBefore(chip, this.input);
    }

    // placeholder behavior
    this.input.placeholder = selected.length ? "" : this.placeholder;
  }

  openMenu() {
    this._open = true;
    this.menu.classList.add("open");
  }

  closeMenu() {
    this._open = false;
    this.menu.classList.remove("open");
    this.menu.innerHTML = "";
  }
}

async function fetchSuggest(field, q, limit = 20) {
  const url = `${API_BASE}/api/serie-hierarchy/suggest/${encodeURIComponent(field)}?` + qs({ q, limit });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Suggest ${field} failed: ${res.status}`);
  const data = await res.json();
  return data.items || [];
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

      startaar_from: state.startaarFrom,
      startaar_to: state.startaarTo,
      sluttaar_from: state.sluttaarFrom,
      sluttaar_to: state.sluttaarTo,

      // ✅ multi-select params expected by your patched backend
      order_nos: state.orderNos,
      navn_values: state.navnValues,
      identifikator_values: state.identValues,
      tags_any: state.tagValues,
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
  const start = (state.page - 1) * state.pageSize + 1;
  const end = Math.min(state.page * state.pageSize, state.total);
  el.stats.textContent = state.total
    ? `Viser ${start.toLocaleString("no-NO")}–${end.toLocaleString("no-NO")} av ${state.total.toLocaleString("no-NO")} rader`
    : "Ingen treff.";

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

/* Horizontal scroll sync */
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

function wireBasicInputs(onAnyChange) {
  const onChange = debounce(() => {
    state.page = 1;
    state.q = el.q.value;
    state.startaarFrom = el.startaarFrom.value;
    state.startaarTo = el.startaarTo.value;
    state.sluttaarFrom = el.sluttaarFrom.value;
    state.sluttaarTo = el.sluttaarTo.value;
    onAnyChange();
  }, 200);

  el.q.addEventListener("input", onChange);
  el.startaarFrom.addEventListener("input", onChange);
  el.startaarTo.addEventListener("input", onChange);
  el.sluttaarFrom.addEventListener("input", onChange);
  el.sluttaarTo.addEventListener("input", onChange);
}

async function init() {
  buildHeader();
  setupHorizontalScrollSync();

  const trigger = debounce(() => fetchPage(), 0);

  // ✅ Multi-select dropdowns (search + chips)
  const msOrder = new MultiSelect(el.msOrder, {
    getSelected: () => state.orderNos,
    setSelected: (v) => { state.orderNos = v; },
    fetchItems: async (q) => await fetchSuggest("order_no", q),
    maxSelected: 200,
  });
  msOrder.onChange = () => { state.page = 1; trigger(); };

  const msIdent = new MultiSelect(el.msIdent, {
    getSelected: () => state.identValues,
    setSelected: (v) => { state.identValues = v; },
    fetchItems: async (q) => await fetchSuggest("identifikator", q),
    maxSelected: 200,
  });
  msIdent.onChange = () => { state.page = 1; trigger(); };

  const msNavn = new MultiSelect(el.msNavn, {
    getSelected: () => state.navnValues,
    setSelected: (v) => { state.navnValues = v; },
    fetchItems: async (q) => await fetchSuggest("navn", q),
    maxSelected: 200,
  });
  msNavn.onChange = () => { state.page = 1; trigger(); };

  const msTags = new MultiSelect(el.msTags, {
    getSelected: () => state.tagValues,
    setSelected: (v) => { state.tagValues = v; },
    fetchItems: async (q) => await fetchSuggest("tags", q),
    maxSelected: 200,
  });
  msTags.onChange = () => { state.page = 1; trigger(); };

  wireBasicInputs(() => fetchPage());

  el.resetBtn.addEventListener("click", () => {
    el.q.value = "";
    el.startaarFrom.value = "";
    el.startaarTo.value = "";
    el.sluttaarFrom.value = "";
    el.sluttaarTo.value = "";

    msOrder.clear();
    msIdent.clear();
    msNavn.clear();
    msTags.clear();

    state.sortKey = "startaar";
    state.sortDir = "asc";
    state.page = 1;

    fetchPage();
  });

  window.addEventListener("resize", debounce(updateTopScrollbarSpacer, 150));

  await fetchPage();
}

window.addEventListener("DOMContentLoaded", init);
