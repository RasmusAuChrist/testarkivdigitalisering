const API_BASE = "https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net";

const arkivFilter = document.getElementById("arkivFilter");
const searchInput = document.getElementById("searchInput");
const summary = document.getElementById("summary");
const content = document.getElementById("content");
const loadingOverlay = document.getElementById("loadingOverlay");

let currentPage = 1;
let pageSize = 250;
let currentTotalPages = 1;
let currentItems = [];

function showLoading() {
  loadingOverlay.style.display = "flex";
}

function hideLoading() {
  loadingOverlay.style.display = "none";
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

function isValidUrl(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

async function fetchJson(url) {
  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
}

async function loadArkivNavnOptions() {
  const names = await fetchJson(`${API_BASE}/api/sah-arkiv-navn`);
  arkivFilter.innerHTML = `<option value="">Alle</option>`;

  names.forEach(name => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    arkivFilter.appendChild(option);
  });
}

async function loadItems(page = 1) {
  const params = new URLSearchParams();
  const selectedArkivNavn = arkivFilter.value.trim();
  const search = searchInput.value.trim();

  params.set("page", page);
  params.set("page_size", pageSize);

  if (selectedArkivNavn) {
    params.set("arkiv_navn", selectedArkivNavn);
  }

  if (search) {
    params.set("search", search);
  }

  const result = await fetchJson(`${API_BASE}/api/sah-items?${params.toString()}`);

  currentPage = result.page;
  currentTotalPages = result.total_pages;
  currentItems = result.items;

  renderTable(result.total, result.page, result.page_size, result.total_pages);
}

function renderTable(total, page, pageSize, totalPages) {
  summary.textContent = `Viser side ${page} av ${totalPages} — ${total} treff totalt`;

  if (!currentItems.length) {
    content.innerHTML = `
      <div class="empty-state">Ingen treff funnet.</div>
    `;
    return;
  }

  const rowsHtml = currentItems.map(item => {
    const arkivIdentifikator = escapeHtml(item.arkiv_identifikator || "");
    const arkivNavn = escapeHtml(item.arkiv_navn || "");
    const astaStiRaw = item.asta_sti || "";
    const astaStiEscaped = escapeHtml(astaStiRaw);

    const astaStiCell = isValidUrl(astaStiRaw)
      ? `<a class="asta-link" href="${astaStiEscaped}" target="_blank" rel="noopener noreferrer">${astaStiEscaped}</a>`
      : astaStiEscaped;

    return `
      <tr>
        <td>${arkivIdentifikator}</td>
        <td>${arkivNavn}</td>
        <td>${astaStiCell}</td>
      </tr>
    `;
  }).join("");

  const prevDisabled = page <= 1 ? "disabled" : "";
  const nextDisabled = page >= totalPages ? "disabled" : "";

  content.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>arkiv_identifikator</th>
            <th>arkiv_navn</th>
            <th>asta_sti</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>

    <div class="pagination" style="display:flex; gap:12px; align-items:center; margin-top:16px;">
      <button id="prevPage" ${prevDisabled}>Forrige</button>
      <span>Side ${page} / ${totalPages}</span>
      <button id="nextPage" ${nextDisabled}>Neste</button>
    </div>
  `;

  const prevBtn = document.getElementById("prevPage");
  const nextBtn = document.getElementById("nextPage");

  if (prevBtn) {
    prevBtn.addEventListener("click", async () => {
      if (currentPage > 1) {
        try {
          showLoading();
          await loadItems(currentPage - 1);
        } finally {
          hideLoading();
        }
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", async () => {
      if (currentPage < currentTotalPages) {
        try {
          showLoading();
          await loadItems(currentPage + 1);
        } finally {
          hideLoading();
        }
      }
    });
  }
}

function renderError(message) {
  summary.textContent = "Feil ved lasting";
  content.innerHTML = `
    <div class="error-state">${escapeHtml(message)}</div>
  `;
}

function debounce(fn, delay = 300) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

const debouncedReload = debounce(async () => {
  try {
    showLoading();
    await loadItems(1);
  } catch (error) {
    console.error(error);
    renderError(error.message || "Ukjent feil");
  } finally {
    hideLoading();
  }
}, 300);

async function init() {
  try {
    showLoading();
    await loadArkivNavnOptions();
    await loadItems(1);

    arkivFilter.addEventListener("change", debouncedReload);
    searchInput.addEventListener("input", debouncedReload);
  } catch (error) {
    console.error("Error initializing SAH page:", error);
    renderError(error.message || "Ukjent feil");
  } finally {
    hideLoading();
  }
}

init();