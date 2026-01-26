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

  // Status distribution chart
  const ctx = document.getElementById("statusChart")?.getContext("2d");
  if (!ctx) return;

  fetch("https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net/api/status-distribution")
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

      // Normalize + enforce flow order
      const sortedData = sortOrder.map(name => {
        const match = data.find(d => d.status === name);
        return {
          status: name,
          total_stykker: match ? match.total_stykker : 0,
          ordre_count: match ? match.ordre_count : 0
        };
      });

      const labels = sortedData.map(d => d.status);
      const values = sortedData.map(d => d.total_stykker);

      // Color bars by ordre_count (darker = more ordre)
      const maxOrdre = Math.max(...sortedData.map(d => d.ordre_count), 1);

      const backgroundColors = sortedData.map(d => {
        const ratio = d.ordre_count / maxOrdre; // 0–1
        const blue = Math.round(180 + ratio * 75); // 180–255
        return `rgba(54, 162, ${blue}, 0.8)`;
      });

      new Chart(ctx, {
        type: "bar",
        data: {
          labels,
          datasets: [{
            label: "Antall stykker",
            data: values,
            backgroundColor: backgroundColors
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => {
                  const d = sortedData[ctx.dataIndex];
                  return [
                    `${ctx.formattedValue} stykker`,
                    `${d.ordre_count} ordre`
                  ];
                }
              }
            }
          },
          scales: {
            x: {
              ticks: {
                autoSkip: false,
                maxRotation: 45,
                minRotation: 30
              }
            },
            y: {
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
      console.error("Kunne ikke laste statusfordeling:", err);
    });
});
