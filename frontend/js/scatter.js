const chartCanvas = document.getElementById("scatterChart").getContext("2d");
const filterSelect = document.getElementById("lokasjonFilter");

let chartInstance = null;
let fullData = [];

fetch("https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net/api/scatter-data")
  .then(res => res.json())
  .then(data => {
    fullData = data;
    populateFilterOptions(data);
    renderChart(data);
  })
  .catch(err => console.error("❌ Failed to load scatter data:", err));

function populateFilterOptions(data) {
  const uniqueLocations = Array.from(new Set(data.map(d => d.lokasjon).filter(Boolean)));
  uniqueLocations.sort();
  for (let loc of uniqueLocations) {
    const option = document.createElement("option");
    option.value = loc;
    option.textContent = loc;
    filterSelect.appendChild(option);
  }
}

filterSelect.addEventListener("change", () => {
  const selected = filterSelect.value;
  const filtered = selected === "ALL" ? fullData : fullData.filter(d => d.lokasjon === selected);
  renderChart(filtered);
});

function renderChart(data) {
  const dataset = data.map(d => ({
    x: d.percentage_digitized,
    y: d.average_views_media,
    navn: d.navn,
    identifikator: d.identifikator
  }));

  if (chartInstance) {
    chartInstance.destroy();
  }

  chartInstance = new Chart(chartCanvas, {
    type: 'scatter',
    data: {
      datasets: [{
        label: "Arkiver",
        data: dataset,
        backgroundColor: "rgba(75, 192, 192, 0.6)",
        pointRadius: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          title: { display: true, text: "Prosent Digitalisert" },
          min: 0,
          max: 1
        },
        y: {
          title: { display: true, text: "Gj.snitt Visninger (Media)" },
          beginAtZero: true
        }
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: ctx => {
              const d = ctx.raw;
              return `${d.navn} (${d.identifikator})\nDigitalisert: ${d.x}\nVisninger: ${d.y}`;
            }
          }
        },
        zoom: {
          pan: {
            enabled: true,
            mode: 'xy',
            modifierKey: 'ctrl'
          },
          zoom: {
            wheel: {
              enabled: true
            },
            pinch: {
              enabled: true
            },
            mode: 'xy'
          }
        }
      }
    }
  });
}
