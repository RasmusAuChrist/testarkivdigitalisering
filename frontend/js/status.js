import { initProtectedPage, apiGet } from "./page_auth.js";

document.addEventListener("DOMContentLoaded", async () => {
  const me = await initProtectedPage();
  if (!me) return;

  loadStatus();
});

async function loadStatus() {
  const loading = document.getElementById("loading");
  const tableBody = document.getElementById("status-body");

  try {
      const data = await apiGet("/api/status");

    if (!Array.isArray(data)) {
      console.error("Expected array from /api/status, got:", data);
      loading.textContent = "Feil ved lasting av data.";
      return;
    }

    renderStatus(data);
    loading.style.display = "none";

  } catch (err) {
    console.error("Error loading status:", err);
    loading.textContent = "Feil ved henting av status.";
  }
}

function renderStatus(rows) {
  const tableBody = document.getElementById("status-body");
  tableBody.innerHTML = "";

  const now = new Date();

  rows.forEach(row => {
    const tr = document.createElement("tr");

    const utcString = row.LastLoaded.replace(" ", "T") + "Z";
    const lastLoaded = new Date(utcString);

    const ageHours = (now - lastLoaded) / (1000 * 60 * 60);

    let color;
    if (ageHours < 25) {
      color = "green";
    } else if (ageHours <= 72) {
      color = "yellow";
    } else {
      color = "red";
    }

    tr.innerHTML = `
      <td><span class="status-dot ${color}"></span></td>
      <td>${row.TableName}</td>
      <td>${lastLoaded.toLocaleString("no-NO", {
        timeZone: "Europe/Oslo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      })}</td>
    `;

    tableBody.appendChild(tr);
  });
}