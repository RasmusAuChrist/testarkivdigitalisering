import { initProtectedPage, apiGet } from "./page_auth.js";

const el = {
  lokasjon: document.getElementById("lokasjonInput"),
  search: document.getElementById("searchInput"),
  ordningsgrad: document.getElementById("ordningsgradFilter"),
  katalogisering: document.getElementById("katalogiseringFilter"),
  attention: document.getElementById("attentionFilter"),
  reload: document.getElementById("reloadBtn"),

  archivesTotal: document.getElementById("archivesTotal"),
  stykkeTotal: document.getElementById("stykkeTotal"),
  attentionTotal: document.getElementById("attentionTotal"),
  digitizedAvg: document.getElementById("digitizedAvg"),

  stats: document.getElementById("stats"),
  head: document.getElementById("tableHead"),
  body: document.getElementById("tableBody"),
  pagination: document.getElementById("pagination"),
  loading: document.getElementById("loadingOverlay"),
};

const state = {
  raw: [],
  filtered: [],
  page: 1,
  pageSize: 100,
  sortKey: "attention_needed",
  sortDir: "desc",
  charts: {},
};

const columns = [
  { key: "attention_needed", label: "Status", render: statusBadge },
  { key: "navn", label: "Navn" },
  { key: "identifikator", label: "Identifikator" },
  { key: "startaar", label: "Startår", numeric: true },
  { key: "sluttar", label: "Sluttår", numeric: true },
  { key: "ordningsgrad_value", label: "Ordningsgrad" },
  { key: "katalogisering_value", label: "Katalogisering" },
  { key: "fysisktilstand_value", label: "Fysisk tilstand" },
  { key: "stykke_count", label: "Stykker", numeric: true },
  { key: "percentage_digitized_percent", label: "Digitalisert %", numeric: true },
  { key: "serier", label: "Serier" },
];

function showLoading() {
  if (el.loading) el.loading.style.display = "flex";
}

function hideLoading() {
  if (el.loading) el.loading.style.display = "none";
}

function formatNumber(v) {
  return new Intl.NumberFormat("nb-NO").format(Number(v || 0));
}

function formatPercent(v) {
  return `${Number(v || 0).toFixed(2).replace(".", ",")}%`;
}

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusBadge(row) {
  if (row.attention_needed) {
    return `<span class="badge attention">Trenger oppfølging</span>`;
  }
  return `<span class="badge ok">OK</span>`;
}

async function loadData() {
  showLoading();

  try {
    const lokasjon = el.lokasjon.value.trim() || "SAB";

    const [summary, archives] = await Promise.all([
      apiGet(`/api/order-degree/summary?lokasjon=${encodeURIComponent(lokasjon)}`),
      apiGet(`/api/order-degree/archives?lokasjon=${encodeURIComponent(lokasjon)}`),
    ]);

    state.raw = archives.items || [];
    renderSummary(summary);
    buildDropdowns();
    applyFilters();
    renderCharts(summary);
  } finally {
    hideLoading();
  }
}

function renderSummary(summary) {
  el.archivesTotal.textContent = formatNumber(summary.archives_total);
  el.stykkeTotal.textContent = formatNumber(summary.stykke_total);
  el.attentionTotal.textContent = formatNumber(summary.attention_needed_count);
  el.digitizedAvg.textContent = formatPercent(summary.average_digitized_percent);
}

function buildDropdowns() {
  fillSelect(el.ordningsgrad, unique(state.raw.map(r => r.ordningsgrad_value)));
  fillSelect(el.katalogisering, unique(state.raw.map(r => r.katalogisering_value)));
}

function fillSelect(select, values) {
  const current = select.value;
  select.innerHTML = `<option value="">Alle</option>`;

  values
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "no"))
    .forEach(value => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });

  select.value = current;
}

function applyFilters() {
  const q = el.search.value.trim().toLowerCase();
  const ord = el.ordningsgrad.value;
  const kat = el.katalogisering.value;
  const attention = el.attention.value;

  state.filtered = state.raw.filter(row => {
    const searchText = `${row.navn || ""} ${row.identifikator || ""}`.toLowerCase();

    if (q && !searchText.includes(q)) return false;
    if (ord && row.ordningsgrad_value !== ord) return false;
    if (kat && row.katalogisering_value !== kat) return false;

    if (attention === "attention" && !row.attention_needed) return false;
    if (attention === "ok" && row.attention_needed) return false;

    return true;
  });

  sortRows();
  state.page = 1;
  render();
}

function sortRows() {
  const dir = state.sortDir === "asc" ? 1 : -1;
  const col = columns.find(c => c.key === state.sortKey);
  const numeric = col?.numeric || state.sortKey === "attention_needed";

  state.filtered.sort((a, b) => {
    const av = a[state.sortKey];
    const bv = b[state.sortKey];

    if (numeric) return (Number(av || 0) - Number(bv || 0)) * dir;

    return String(av || "").localeCompare(String(bv || ""), "no", {
      numeric: true,
      sensitivity: "base",
    }) * dir;
  });
}

function toggleSort(key) {
  if (state.sortKey === key) {
    state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
  } else {
    state.sortKey = key;
    state.sortDir = "asc";
  }

  sortRows();
  render();
}

function render() {
  renderHeader();
  renderStats();
  renderTable();
  renderPagination();
}

function renderHeader() {
  el.head.innerHTML = "";

  columns.forEach(col => {
    const th = document.createElement("th");
    const arrow = state.sortKey === col.key
      ? state.sortDir === "asc" ? " ▲" : " ▼"
      : "";

    th.textContent = col.label + arrow;
    th.style.textAlign = col.numeric ? "right" : "left";
    th.addEventListener("click", () => toggleSort(col.key));
    el.head.appendChild(th);
  });
}

function renderStats() {
  el.stats.textContent =
    `Viser ${formatNumber(state.filtered.length)} av ${formatNumber(state.raw.length)} arkiver`;
}

function renderTable() {
  el.body.innerHTML = "";

  const start = (state.page - 1) * state.pageSize;
  const rows = state.filtered.slice(start, start + state.pageSize);

  if (!rows.length) {
    el.body.innerHTML = `
      <tr>
        <td colspan="${columns.length}" style="padding:14px;color:#777;">
          Ingen treff.
        </td>
      </tr>
    `;
    return;
  }

  rows.forEach(row => {
    const tr = document.createElement("tr");

    columns.forEach(col => {
      const td = document.createElement("td");
      td.style.textAlign = col.numeric ? "right" : "left";

      if (col.render) {
        td.innerHTML = col.render(row);
      } else if (col.key === "percentage_digitized_percent") {
        td.textContent = formatPercent(row[col.key]);
      } else if (col.numeric) {
        td.textContent = formatNumber(row[col.key]);
      } else {
        td.textContent = row[col.key] ?? "";
      }

      tr.appendChild(td);
    });

    el.body.appendChild(tr);
  });
}

function renderPagination() {
  el.pagination.innerHTML = "";

  const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
  if (totalPages <= 1) return;

  const prev = document.createElement("button");
  prev.textContent = "◀ Forrige";
  prev.disabled = state.page <= 1;
  prev.onclick = () => {
    state.page -= 1;
    render();
  };

  const next = document.createElement("button");
  next.textContent = "Neste ▶";
  next.disabled = state.page >= totalPages;
  next.onclick = () => {
    state.page += 1;
    render();
  };

  const label = document.createTextNode(` Side ${state.page} / ${totalPages} `);

  el.pagination.append(prev, label, next);
}

function renderCharts(summary) {
  renderBarChart(
    "ordningsgradChart",
    "Arkiver",
    summary.by_ordningsgrad || {}
  );

  renderBarChart(
    "stykkeChart",
    "Stykker",
    summary.stykke_by_ordningsgrad || {}
  );

  renderBarChart(
    "katalogiseringChart",
    "Arkiver",
    summary.by_katalogisering || {}
  );
}

function renderBarChart(canvasId, label, dataObject) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (state.charts[canvasId]) {
    state.charts[canvasId].destroy();
  }

  const labels = Object.keys(dataObject);
  const values = Object.values(dataObject);

  state.charts[canvasId] = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label,
        data: values,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { precision: 0 },
        },
      },
    },
  });
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function wireEvents() {
  const onFilter = debounce(applyFilters, 200);

  el.search.addEventListener("input", onFilter);
  el.ordningsgrad.addEventListener("change", applyFilters);
  el.katalogisering.addEventListener("change", applyFilters);
  el.attention.addEventListener("change", applyFilters);
  el.reload.addEventListener("click", loadData);

  el.lokasjon.addEventListener("keydown", event => {
    if (event.key === "Enter") loadData();
  });
}

async function init() {
  const me = await initProtectedPage();
  if (!me) return;

  wireEvents();
  await loadData();
}

window.addEventListener("DOMContentLoaded", init);