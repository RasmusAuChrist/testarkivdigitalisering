document.addEventListener("DOMContentLoaded", () => {
  // Hide splash, show main content
  setTimeout(() => {
    document.getElementById("splash-screen").style.display = "none";
    const main = document.getElementById("main-content");
    if (main) main.style.display = "block";
  }, 2000);

  console.log("Dashboard loaded");

  // Fullscreen chart tiles (improved)
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
 * Smooth fullscreen for .chart-box tiles using FLIP animation.
 * - Click tile => fullscreen (only that tile visible)
 * - Click X / press ESC / click backdrop => exit
 * - Chart.js resize on toggle
 */
function setupChartFullscreen() {
  const tiles = Array.from(document.querySelectorAll(".chart-box"));
  if (!tiles.length) return;

  // Ensure backdrop exists (created in JS so you don't have to touch HTML)
  let backdrop = document.getElementById("chart-fullscreen-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.id = "chart-fullscreen-backdrop";
    document.body.appendChild(backdrop);
  }

  let activeTile = null;
  let isAnimating = false;

  // Close when clicking backdrop
  backdrop.addEventListener("click", () => {
    if (activeTile) exitFullscreen();
  });

  tiles.forEach(tile => {
    // Make sure X button exists
    if (!tile.querySelector(".chart-close-btn")) {
      // Positioning context for X
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

    tile.addEventListener("click", () => {
      if (isAnimating) return;
      if (tile.classList.contains("is-fullscreen")) return;
      enterFullscreen(tile);
    });
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && activeTile) exitFullscreen();
  });

  function enterFullscreen(tile) {
    isAnimating = true;

    // FLIP: First
    const first = tile.getBoundingClientRect();

    // Activate fullscreen UI state
    activeTile = tile;
    document.body.classList.add("no-scroll", "dashboard-fullscreen");
    tile.classList.add("is-fullscreen");

    // Force layout so the browser applies the fullscreen styles
    tile.getBoundingClientRect();

    // FLIP: Last (fullscreen)
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

    // Resize charts near end of animation
    setTimeout(() => requestChartResize(tile), 180);

    tile.addEventListener("transitionend", onEnterEnd, { once: true });
    function onEnterEnd() {
      // Cleanup inline transition so future layouts aren’t affected
      tile.style.transition = "";
      tile.style.transform = "";
      isAnimating = false;
      requestChartResize(tile);
    }
  }

  function exitFullscreen() {
    if (!activeTile || isAnimating) return;
    isAnimating = true;

    const tile = activeTile;

    // FLIP: First (fullscreen)
    const first = tile.getBoundingClientRect();

    // Remove fullscreen styles (this returns tile to grid)
    tile.classList.remove("is-fullscreen");

    // Force layout
    tile.getBoundingClientRect();

    // FLIP: Last (grid position)
    const last = tile.getBoundingClientRect();

    // Invert
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    const sx = first.width / last.width;
    const sy = first.height / last.height;

    // Apply inverted transform instantly, then animate to identity
    tile.style.transformOrigin = "top left";
    tile.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;

    requestAnimationFrame(() => {
      tile.style.transition = "transform 260ms cubic-bezier(.2,.8,.2,1)";
      tile.style.transform = "translate(0px, 0px) scale(1, 1)";
    });

    // Restore body state near end
    setTimeout(() => {
      document.body.classList.remove("no-scroll", "dashboard-fullscreen");
      requestChartResize(tile);
    }, 200);

    tile.addEventListener("transitionend", onExitEnd, { once: true });
    function onExitEnd() {
      tile.style.transition = "";
      tile.style.transform = "";
      activeTile = null;
      isAnimating = false;
      requestChartResize(tile);
    }
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
