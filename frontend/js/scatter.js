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
    x: d.percentage_digitized * 100,  // Convert to percentage
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
      interaction: {
        mode: 'nearest',
        axis: 'xy',
        intersect: false
      },
      scales: {
        x: {
          title: { display: true, text: "Digitaliseringsgrad (%)" },
          min: 0,
          max: 100
        },
        y: {
          title: { display: true, text: "Gj.snitt Visninger (Media)" },
          beginAtZero: true
        }
      },
      plugins: {
        tooltip: {
          enabled: false  // Disable default hover tooltips
        },
        zoom: {
          pan: {
            enabled: true,
            mode: 'xy'
          },
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            mode: 'xy'
          }
        }
      },
      onClick: (evt) => {
        const points = chartInstance.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
        if (points.length > 0) {
          const point = points[0];
          const data = chartInstance.data.datasets[point.datasetIndex].data[point.index];
          showCustomTooltip(evt.native, data);
        } else {
          hideCustomTooltip();
        }
      }
    },
    plugins: [{
      // Grab cursor plugin
      id: 'cursorGrab',
      beforeEvent(chart, args) {
        const e = args.event;
        if (e.type === 'mousedown') {
          chart.canvas.style.cursor = 'grabbing';
        } else if (e.type === 'mouseup' || e.type === 'mouseout') {
          chart.canvas.style.cursor = 'default';
        } else if (e.type === 'mousemove') {
          chart.canvas.style.cursor = 'grab';
        }
      }
    }]
  });
}

function showCustomTooltip(mouseEvent, dataPoint) {
  const tooltipId = "custom-tooltip";
  let tooltipEl = document.getElementById(tooltipId);

  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.id = tooltipId;
    tooltipEl.style.position = "absolute";
    tooltipEl.style.background = "#fff";
    tooltipEl.style.border = "1px solid #ccc";
    tooltipEl.style.padding = "8px";
    tooltipEl.style.borderRadius = "4px";
    tooltipEl.style.pointerEvents = "none";
    tooltipEl.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
    tooltipEl.style.fontSize = "14px";
    tooltipEl.style.whiteSpace = "pre-line";
    document.body.appendChild(tooltipEl);
  }

  tooltipEl.innerHTML = `
    <strong>${dataPoint.navn}</strong><br/>
    (${dataPoint.identifikator})<br/>
    Digitalisert: ${dataPoint.x.toFixed(2)}%<br/>
    Visninger: ${dataPoint.y.toFixed(2)}
  `;

  tooltipEl.style.left = mouseEvent.clientX + 10 + "px";
  tooltipEl.style.top = mouseEvent.clientY + 10 + "px";
  tooltipEl.style.display = "block";
}

function hideCustomTooltip() {
  const tooltipEl = document.getElementById("custom-tooltip");
  if (tooltipEl) {
    tooltipEl.style.display = "none";
  }
}
