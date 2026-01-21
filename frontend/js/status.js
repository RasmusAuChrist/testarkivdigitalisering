const API_BASE = "https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net";

async function loadStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/status`);
    const data = await res.json();

    if (!Array.isArray(data)) {
      console.error("Expected array from /api/status, got:", data);
      return;
    }

    renderStatus(data);
  } catch (err) {
    console.error("Error loading status:", err);
  }
}

function renderStatus(rows) {
  const tableBody = document.getElementById("status-body");
  tableBody.innerHTML = "";

  const now = new Date();

  rows.forEach(row => {
    const tr = document.createElement("tr");

    const lastLoaded = new Date(row.LastLoaded);
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
      <td>${lastLoaded.toLocaleString("no-NO")}</td>
    `;

    tableBody.appendChild(tr);
  });
}

loadStatus();
