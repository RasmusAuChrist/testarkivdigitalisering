document.addEventListener("DOMContentLoaded", () => {
  // Hide splash, show main content
  setTimeout(() => {
    document.getElementById("splash-screen").style.display = "none";
    const main = document.getElementById("main-content");
    if (main) main.style.display = "block";
  }, 2000);

  console.log("Dashboard loaded");

  // Fullscreen chart tiles
  setupChartFullscreen();

  // Optional button action
  const goBtn = document.getElementById("go-to-location");
  if (goBtn) {
    goBtn.addEventListener("click", () => {
      window.location.href = "views/location.html";
    });
  }

  // Status chart: stacked per ordre
  const ctx = document.getElementById("statusChart")?.getContext("2d");
  if (!ctx) return;

  fetch("https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net/api/status-by-ordre")
    .then(res => res.json())
    .then(data => {
      const sortOrder = [
        "Analyse",
        "Prioriteringsråd",
        "Arkivkartlegging",
        "Fysisk klargjøring",
        "Klar til sending",
        "Lager NHA",
        "Skanning pågår",
        "Etterarbeid skanning",
        "Skape uttrekk",
        "Kvalitetskontroll",
        "Opplasting og innlemming",
        "Metadata etterarbeid",
        "Opprydning for destruksjon - gjelder både fysisk og digitalt",
        "Opprydning for videresending"
      ];

      // Get all unique ordre values
      const ordres = Array.from(new Set(data.map(d => d.ordre))).sort();

      // Group data by status -> ordre -> stykker
      const statusMap = {};
      data.forEach(d => {
        if (!statusMap[d.status]) statusMap[d.status] = {};
        statusMap[d.status][d.ordre] = d.stykker;
      });

      // Use D3 categorical palette
      const colors = d3.schemeSet3.concat(d3.schemeTableau10);

      // Build datasets per ordre
      const datasets = ordres.map((ordre, i) => ({
        label: `Ordre ${ordre}`,
        backgroundColor: colors[i % colors.length],
        data: sortOrder.map(status => statusMap[status]?.[ordre] || 0)
      }));

      new Chart(ctx, {
        type: "bar",
        data: {
          labels: sortOrder,
          datasets
        },
        options: {
          responsive: true,
          plugins: {
            title: {
              display: true,
              text: "Fordeling av stykker per status og ordre"
            },
            tooltip: {
              mode: "index",
              intersect: false
            },
            legend: {
              position: "bottom"
            }
          },
          scales: {
            x: {
              stacked: true,
              ticks: {
                autoSkip: false,
                maxRotation: 45,
                minRotation: 30
              }
            },
            y: {
              stacked: true,
              beginAtZero: true,
              title: {
                display: true,
                text: "Antall stykker"
              }
            }
          }
        }
      });
    })
    .catch(err => {
      console.error("Kunne ikke laste statusdata:", err);
    });
});

/**
 * Enables click-to-fullscreen on each .chart-box tile.
 * - Click tile => fullscreen
 * - Click X or press ESC => exit fullscreen
 * - Resizes Chart.js charts when toggling
 */
function setupChartFullscreen() {
  const tiles = Array.from(document.querySelectorAll(".chart-box"));
  let activeTile = null;

  // Create close button + click handlers
  tiles.forEach(tile => {
    // Add close button once
    if (!tile.querySelector(".chart-close-btn")) {
      // Ensure positioning context for absolute X button
      const computed = window.getComputedStyle(tile);
      if (computed.position === "static") tile.style.position = "relative";

      const btn = document.createElement("button");
      btn.className = "chart-close-btn";
      btn.type = "button";
      btn.setAttribute("aria-label", "Lukk fullskjerm");
      btn.textContent = "✕";
      tile.appendChild(btn);

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        exitFullscreen();
      });
    }

    // Click tile to open fullscreen
    tile.addEventListener("click", () => {
      if (tile.classList.contains("is-fullscreen")) return;
      enterFullscreen(tile);
    });
  });

  // ESC closes fullscreen
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") exitFullscreen();
  });

  function enterFullscreen(tile) {
    if (activeTile) exitFullscreen();

    activeTile = tile;
    document.body.classList.add("no-scroll");
    tile.classList.add("is-fullscreen");

    requestChartResize(tile);
  }

  function exitFullscreen() {
    if (!activeTile) return;

    const tile = activeTile;
    tile.classList.remove("is-fullscreen");
    document.body.classList.remove("no-scroll");
    activeTile = null;

    requestChartResize(tile);
  }

  function requestChartResize(tile) {
    // If Chart.js is present, resize charts in this tile
    const canvases = tile.querySelectorAll("canvas");
    canvases.forEach((c) => {
      if (window.Chart && typeof window.Chart.getChart === "function") {
        const chart = window.Chart.getChart(c);
        if (chart) chart.resize();
      }
    });
  }
}
