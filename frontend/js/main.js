document.addEventListener("DOMContentLoaded", () => {
  // Hide splash, show main content
  setTimeout(() => {
    document.getElementById("splash-screen").style.display = "none";
    const main = document.getElementById("main-content");
    if (main) main.style.display = "block";
  }, 2000);

  console.log("Dashboard loaded");

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
        "Transport og logistikk",
        "Produksjonsflyt",
        "Skannes",
        "Ferdig skannet",
        "Bevaringspakker",
        "Bevarings-innlemming",
        "Tilgjengeliggjøring"
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
