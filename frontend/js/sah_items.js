const API_BASE = "https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net";

const arkivFilter = document.getElementById("arkivFilter");
const searchInput = document.getElementById("searchInput");
const summary = document.getElementById("summary");
const content = document.getElementById("content");
const loadingOverlay = document.getElementById("loadingOverlay");

let allItems = [];

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

async function loadItems() {
  const selectedArkivNavn = arkivFilter.value.trim();
  const params = new URLSearchParams();

  if (selectedArkivNavn) {
    params.set("arkiv_navn", selectedArkivNavn);
  }

  const url = params.toString()
    ? `${API_BASE}/api/sah-items?${params.toString()}`
    : `${API_BASE}/api/sah-items`;

  allItems = await fetchJson(url);
  renderTable();
}

function getFilteredItems() {
  const searchTerm = searchInput.value.trim().toLowerCase();

  if (!searchTerm) {
    return allItems;
  }

  return allItems.filter(item => {
    const arkivIdentifikator = (item.arkiv_identifikator || "").toLowerCase();
    const arkivNavn = (item.arkiv_navn || "").toLowerCase();
    const astaSti = (item.asta_sti || "").toLowerCase();

    return (
      arkivIdentifikator.includes(searchTerm) ||
      arkivNavn.includes(searchTerm) ||
      astaSti.includes(searchTerm)
    );
  });
}

function renderTable() {
  const filteredItems = getFilteredItems();
  const selectedName = arkivFilter.value.trim();

  summary.textContent = selectedName
    ? `Viser ${filteredItems.length} rader for arkiv_navn: ${selectedName}`
    : `Viser ${filteredItems.length} rader for alle SAH-poster`;

  if (!filteredItems.length) {
    content.innerHTML = `
      <div class="empty-state">
        Ingen treff funnet.
      </div>
    `;
    return;
  }

  const rowsHtml = filteredItems.map(item => {
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
  `;
}

function renderError(message) {
  summary.textContent = "Feil ved lasting";
  content.innerHTML = `
    <div class="error-state">
      ${escapeHtml(message)}
    </div>
  `;
}

function debounce(fn, delay = 200) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

const debouncedRender = debounce(renderTable, 150);

async function init() {
  try {
    showLoading();
    await loadArkivNavnOptions();
    await loadItems();

    arkivFilter.addEventListener("change", async () => {
      try {
        showLoading();
        await loadItems();
      } catch (error) {
        console.error("Error loading SAH items:", error);
        renderError(error.message || "Ukjent feil");
      } finally {
        hideLoading();
      }
    });

    searchInput.addEventListener("input", debouncedRender);
  } catch (error) {
    console.error("Error initializing SAH page:", error);
    renderError(error.message || "Ukjent feil");
  } finally {
    hideLoading();
  }
}

init();