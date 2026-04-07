const API_BASE = "https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net";

const arkivFilter = document.getElementById("arkivFilter");
const searchInput = document.getElementById("searchInput");
const summary = document.getElementById("summary");
const content = document.getElementById("content");
const loadingOverlay = document.getElementById("loadingOverlay");

const totalItemsValue = document.getElementById("totalItemsValue");
const movedItemsValue = document.getElementById("movedItemsValue");
const notMovedItemsValue = document.getElementById("notMovedItemsValue");
const deviationItemsValue = document.getElementById("deviationItemsValue");
const progressFill = document.getElementById("progressFill");
const progressLabel = document.getElementById("progressLabel");
const statusButtons = Array.from(document.querySelectorAll(".status-btn"));

let currentPage = 1;
let pageSize = 250;
let currentTotalPages = 1;
let currentItems = [];
let currentStatus = "";

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

function formatNumber(value) {
  return new Intl.NumberFormat("nb-NO").format(Number(value || 0));
}

function statusLabel(status) {
  if (status === "flyttet") return "Flyttet";
  if (status === "ikke_flyttet") return "Ikke flyttet";
  if (status === "avvik") return "Avvik";
  return "Ukjent";
}

function statusBadgeClass(status) {
  if (status === "flyttet") return "flyttet";
  if (status === "ikke_flyttet") return "ikke_flyttet";
  return "avvik";
}

function updateStatusButtons() {
  statusButtons.forEach(button => {
    const isActive = button.dataset.status === currentStatus;
    button.classList.toggle("active", isActive);
  });
}

function renderSummaryCards(summaryData) {
  const totalItems = summaryData?.total_items || 0;
  const movedCorrectly = summaryData?.moved_correctly || 0;
  const notMoved = summaryData?.not_moved || 0;
  const deviations = summaryData?.deviations || 0;
  const progressPercent = summaryData?.progress_percent || 0;

  totalItemsValue.textContent = formatNumber(totalItems);
  movedItemsValue.textContent = formatNumber(movedCorrectly);
  notMovedItemsValue.textContent = formatNumber(notMoved);
  deviationItemsValue.textContent = formatNumber(deviations);
  progressFill.style.width = `${Math.max(0, Math.min(progressPercent, 100))}%`;
  progressLabel.textContent = `${String(progressPercent).replace(".", ",")}%`;
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

  if (currentStatus) {
    params.set("status", currentStatus);
  }

  const result = await fetchJson(`${API_BASE}/api/sah-items?${params.toString()}`);

  currentPage = result.page;
  currentTotalPages = result.total_pages;
  currentItems = result.items;

  renderSummaryCards(result.summary || {});
  renderTable(result.total, result.page, result.page_size, result.total_pages);
}

function renderTable(total, page, pageSize, totalPages) {
  const statusText = currentStatus ? `, status: ${statusLabel(currentStatus)}` : "";
  summary.textContent = `Viser side ${page} av ${totalPages || 1} — ${formatNumber(total)} treff totalt${statusText}`;

  if (!currentItems.length) {
    content.innerHTML = `
      <div class="empty-state">Ingen treff funnet.</div>
    `;
    return;
  }

  const rowsHtml = currentItems.map(item => {
    const stykkeIdentifikator = escapeHtml(item.stykke_identifikator || "");
    const arkivIdentifikator = escapeHtml(item.arkiv_identifikator || "");
    const arkivNavn = escapeHtml(item.arkiv_navn || "");
    const lokasjon = escapeHtml(item.lokasjon || "");
    const hylleplassering = escapeHtml(item.hylleplassering || "");
    const astaStiRaw = item.asta_sti || "";
    const astaStiEscaped = escapeHtml(astaStiRaw);
    const movementStatus = item.movement_status || "avvik";

    const astaStiCell = isValidUrl(astaStiRaw)
      ? `<a class="asta-link" href="${astaStiEscaped}" target="_blank" rel="noopener noreferrer">${astaStiEscaped}</a>`
      : astaStiEscaped;

    return `
      <tr>
        <td><span class="badge ${statusBadgeClass(movementStatus)}">${escapeHtml(statusLabel(movementStatus))}</span></td>
        <td>${stykkeIdentifikator}</td>
        <td>${arkivIdentifikator}</td>
        <td>${arkivNavn}</td>
        <td>${lokasjon}</td>
        <td>${hylleplassering}</td>
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
            <th>Status</th>
            <th>stykke_identifikator</th>
            <th>arkiv_identifikator</th>
            <th>arkiv_navn</th>
            <th>lokasjon</th>
            <th>hylleplassering</th>
            <th>asta_sti</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>

    <div class="pagination">
      <button id="prevPage" ${prevDisabled}>Forrige</button>
      <span>Side ${page} / ${totalPages || 1}</span>
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
        } catch (error) {
          console.error(error);
          renderError(error.message || "Ukjent feil");
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
        } catch (error) {
          console.error(error);
          renderError(error.message || "Ukjent feil");
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
    updateStatusButtons();
    showLoading();
    await loadArkivNavnOptions();
    await loadItems(1);

    arkivFilter.addEventListener("change", debouncedReload);
    searchInput.addEventListener("input", debouncedReload);

    statusButtons.forEach(button => {
      button.addEventListener("click", async () => {
        try {
          currentStatus = button.dataset.status || "";
          currentPage = 1;
          updateStatusButtons();
          showLoading();
          await loadItems(1);
        } catch (error) {
          console.error(error);
          renderError(error.message || "Ukjent feil");
        } finally {
          hideLoading();
        }
      });
    });
  } catch (error) {
    console.error("Error initializing SAH page:", error);
    renderError(error.message || "Ukjent feil");
  } finally {
    hideLoading();
  }
}

init();