const API_BASE = "https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net";

async function loadStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/status`);
    const data = await res.json();
    renderStatus(data);
  } catch (err) {
    console.error("Error loading status:", err);
  }
}

function renderStatus(rows) {
  const tableBody = document.querySelector("#statusTable tbody");
  tableBody.innerHTML = "";

  rows.forEach(row => {
    const tr = document.createElement("tr");

    const tableNameTd = document.createElement("td");
    tableNameTd.textContent = row.TableName;

    const lastLoadedTd = document.createElement("td");
    const lastLoaded = new Date(row.LastLoaded);
    lastLoadedTd.textContent = lastLoaded.toLocaleString();

    const statusTd = document.createElement("td");
    const ageHours = (Date.now() - lastLoaded.getTime()) / (1000 * 60 * 60);

    if (ageHours < 25) {
      statusTd.className = "status-dot green";
    } else if (ageHours <= 72) {
      statusTd.className = "status-dot yellow";
    } else {
      statusTd.className = "status-dot red";
    }

    tr.appendChild(tableNameTd);
    tr.appendChild(lastLoadedTd);
    tr.appendChild(statusTd);
    tableBody.appendChild(tr);
  });
}

loadStatus();
