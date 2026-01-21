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
  const tbody = document.getElementById("status-body");
  tbody.innerHTML = "";

  const now = new Date();

  rows.forEach(row => {
    const lastLoadedDate = new Date(row.LastLoaded);

    const diffMs = now - lastLoadedDate;
    const diffMinutes = diffMs / 1000 / 60;

    let color;
    if (diffMinutes < 30) {
      color = "green";     // updated recently
    } else if (diffMinutes < 120) {
      color = "yellow";    // moderately old
    } else {
      color = "red";       // old
    }

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td><span class="status-dot" style="background:${color};"></span></td>
      <td>${row.TableName}</td>
      <td>${lastLoadedDate.toLocaleString("no-NO")}</td>
    `;

    tbody.appendChild(tr);
  });
}

loadStatus();
