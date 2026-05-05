document.addEventListener("DOMContentLoaded", () => {
  // Hide splash, show main content
  setTimeout(() => {
    const splash = document.getElementById("splash-screen");
    if (splash) splash.style.display = "none";
    const main = document.getElementById("main-content");
    if (main) main.style.display = "block";
  }, 2000);

  console.log("Dashboard loaded");

  import { initProtectedPage } from "./page_auth.js";

document.addEventListener("DOMContentLoaded", async () => {
  const me = await initProtectedPage();
  if (!me) return;

  // existing page startup code here
});

  // ✅ Fullscreen chart tiles (matches CSS: body.dashboard-fullscreen + #chart-fullscreen-backdrop)
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

      const ordres = Array.from(new Set(data.map(d => d.ordre))).sort();

      const statusMap = {};
      data.forEach(d => {
        if (!statusMap[d.status]) statusMap[d.status] = {};
        statusMap[d.status][d.ordre] = d.stykker;
      });

      const colors = d3.schemeSet3.concat(d3.schemeTableau10);

      const datasets = ordres.map((ordre, i) => ({
        label: `Ordre ${ordre}`,
        backgroundColor: colors[i % colors.length],
        data: sortOrder.map(status => statusMap[status]?.[ordre] || 0)
      }));

      new Chart(ctx, {
        type: "bar",
        data: { labels: sortOrder, datasets },
        options: {
          responsive: true,
          plugins: {
            title: { display: true, text: "Fordeling av stykker per status og ordre" },
            tooltip: { mode: "index", intersect: false },
            legend: { position: "bottom" }
          },
          scales: {
            x: {
              stacked: true,
              ticks: { autoSkip: false, maxRotation: 45, minRotation: 30 }
            },
            y: {
              stacked: true,
              beginAtZero: true,
              title: { display: true, text: "Antall stykker" }
            }
          }
        }
      });
    })
    .catch(err => console.error("Kunne ikke laste statusdata:", err));
});

/**
 * Smooth fullscreen for .chart-box tiles using FLIP animation.
 * Matches CSS:
 * - body.no-scroll
 * - body.dashboard-fullscreen
 * - #chart-fullscreen-backdrop
 * - .chart-box.is-fullscreen
 */
function setupChartFullscreen() {
  const tiles = Array.from(document.querySelectorAll(".chart-box"));
  if (!tiles.length) return;

  // Create backdrop once (no HTML change needed)
  let backdrop = document.getElementById("chart-fullscreen-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.id = "chart-fullscreen-backdrop";
    document.body.appendChild(backdrop);
  }

  let activeTile = null;
  let isAnimating = false;

  // Clicking backdrop closes
  backdrop.addEventListener("click", () => {
    if (activeTile) exitFullscreen();
  });

  // ESC closes
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && activeTile) exitFullscreen();
  });

  tiles.forEach(tile => {
    // Ensure X exists
    if (!tile.querySelector(".chart-close-btn")) {
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

    // Click tile -> fullscreen
    tile.addEventListener("click", (e) => {
      if (isAnimating) return;
      if (tile.classList.contains("is-fullscreen")) return;

      // Safety: don't trigger if the click came from an interactive element inside the tile
      const t = e.target;
      if (t instanceof HTMLElement) {
        if (t.closest("button, a, input, select, textarea, label")) return;
      }

      enterFullscreen(tile);
    });
  });

  function enterFullscreen(tile) {
    isAnimating = true;

    // FLIP: First (tile in grid)
    const first = tile.getBoundingClientRect();

    activeTile = tile;

    // Apply fullscreen state (CSS uses these)
    document.body.classList.add("no-scroll", "dashboard-fullscreen");
    tile.classList.add("is-fullscreen");

    // Force fullscreen layout to compute "last"
    tile.getBoundingClientRect();

    // FLIP: Last (tile fullscreen)
    const last = tile.getBoundingClientRect();

    // Invert
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    const sx = first.width / last.width;
    const sy = first.height / last.height;

    tile.style.transformOrigin = "top left";
    tile.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;

    // Play
    requestAnimationFrame(() => {
      tile.style.transition = "transform 260ms cubic-bezier(.2,.8,.2,1)";
      tile.style.transform = "translate(0px, 0px) scale(1, 1)";
    });

    // Resize charts near end
    setTimeout(() => requestChartResize(tile), 180);

    tile.addEventListener("transitionend", () => {
      tile.style.transition = "";
      tile.style.transform = "";
      isAnimating = false;
      requestChartResize(tile);
    }, { once: true });
  }

  function exitFullscreen() {
    if (!activeTile || isAnimating) return;
    isAnimating = true;

    const tile = activeTile;

    // FLIP: First (fullscreen)
    const first = tile.getBoundingClientRect();

    // Remove fullscreen class so it returns to grid position
    tile.classList.remove("is-fullscreen");

    // Force layout (grid position becomes measurable)
    tile.getBoundingClientRect();

    // FLIP: Last (grid)
    const last = tile.getBoundingClientRect();

    const dx = first.left - last.left;
    const dy = first.top - last.top;
    const sx = first.width / last.width;
    const sy = first.height / last.height;

    tile.style.transformOrigin = "top left";
    tile.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;

    requestAnimationFrame(() => {
      tile.style.transition = "transform 260ms cubic-bezier(.2,.8,.2,1)";
      tile.style.transform = "translate(0px, 0px) scale(1, 1)";
    });

    // IMPORTANT: remove body classes *after* animation so other tiles don't "pop"
    tile.addEventListener("transitionend", () => {
      tile.style.transition = "";
      tile.style.transform = "";

      document.body.classList.remove("no-scroll", "dashboard-fullscreen");

      activeTile = null;
      isAnimating = false;

      requestChartResize(tile);
    }, { once: true });
  }

  function requestChartResize(tile) {
    const canvases = tile.querySelectorAll("canvas");
    canvases.forEach((c) => {
      if (window.Chart && typeof window.Chart.getChart === "function") {
        const chart = window.Chart.getChart(c);
        if (chart) chart.resize();
      }
    });
  }
}
