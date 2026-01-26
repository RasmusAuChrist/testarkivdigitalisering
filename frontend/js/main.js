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

  // Status distribution chart (if canvas exists)
  const ctx = document.getElementById("statusChart")?.getContext("2d");
  if (ctx) {
    fetch("https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net/api/status-distribution")
      .then(res => res.json())
      .then(data => {
        const labels = data.map(d => d.status);
        const values = data.map(d => d.total_stykker);

        new Chart(ctx, {
          type: "bar",
          data: {
            labels,
            datasets: [{
              label: "Antall stykker",
              data: values,
              backgroundColor: "rgba(54, 162, 235, 0.6)"
            }]
          },
          options: {
            responsive: true,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: ctx => `${ctx.formattedValue} stykker`
                }
              }
            },
            scales: {
              x: {
                ticks: { autoSkip: false, maxRotation: 45, minRotation: 30 }
              },
              y: {
                beginAtZero: true
              }
            }
          }
        });
      })
      .catch(err => {
        console.error("Kunne ikke laste statusfordeling:", err);
      });
  }
});
