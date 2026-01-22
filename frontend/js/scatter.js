const canvas = document.getElementById("scatterCanvas");
const tooltip = document.getElementById("customTooltip");
const filter = document.getElementById("lokasjonFilter");

const ctx = canvas.getContext("2d");
const margin = { top: 50, right: 40, bottom: 50, left: 60 };
let width = canvas.width = canvas.clientWidth;
let height = canvas.height = canvas.clientHeight;

let fullData = [];
let filteredData = [];
let transform = d3.zoomIdentity;

let yScaleRaw = d3.scaleLinear().domain([0, 20]).range([height - margin.bottom, margin.top]);

const xScale = d3.scaleLinear().domain([0, 100]).range([margin.left, width - margin.right]);

const zoom = d3.zoom()
  .scaleExtent([0.5, 20])
  .translateExtent([[0, 0], [width, height]])
  .on("zoom", (event) => {
    transform = event.transform;
    draw();
  });

d3.select(canvas).call(zoom);

fetch("https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net/api/scatter-data")
  .then(res => res.json())
  .then(data => {
    fullData = data.filter(d => d.percentage_digitized !== null && d.average_views_media !== null);
    populateFilter(fullData);
    applyFilter();
  });

function populateFilter(data) {
  const uniqueLocations = Array.from(new Set(data.map(d => d.lokasjon).filter(Boolean))).sort();
  for (const loc of uniqueLocations) {
    const opt = document.createElement("option");
    opt.value = loc;
    opt.textContent = loc;
    filter.appendChild(opt);
  }

  filter.addEventListener("change", applyFilter);
}

function applyFilter() {
  const selected = filter.value;

  filteredData = selected === "ALL"
    ? fullData
    : fullData.filter(d => d.lokasjon === selected);

  // Dynamically set Y-axis domain based on data max
  const maxY = d3.max(filteredData, d => d.average_views_media) || 20;
  yScaleRaw = d3.scaleLinear().domain([0, maxY * 1.1]).range([height - margin.bottom, margin.top]);

  draw();
}

function draw() {
  ctx.clearRect(0, 0, width, height);
  const zx = transform.rescaleX(xScale);
  const zy = transform.rescaleY(yScaleRaw);

  drawAxes(zx, zy);

  ctx.fillStyle = "steelblue";
  for (const d of filteredData) {
    const x = zx(d.percentage_digitized * 100);
    const y = zy(d.average_views_media);
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, 2 * Math.PI);
    ctx.fill();
  }
}

function drawAxes(zx, zy) {
  ctx.font = "12px sans-serif";
  ctx.fillStyle = "#333";
  ctx.strokeStyle = "#aaa";
  ctx.lineWidth = 1;

  const xticks = zx.ticks(10);
  xticks.forEach(t => {
    const x = zx(t);
    ctx.beginPath();
    ctx.moveTo(x, height - margin.bottom);
    ctx.lineTo(x, height - margin.bottom + 6);
    ctx.stroke();
    ctx.fillText(`${t}%`, x - 10, height - margin.bottom + 18);
  });

  ctx.fillText("Digitaliseringsgrad (%)", width / 2 - 60, height - 10);

  const yticks = zy.ticks(10);
  yticks.forEach(t => {
    const y = zy(t);
    ctx.beginPath();
    ctx.moveTo(margin.left - 6, y);
    ctx.lineTo(margin.left, y);
    ctx.stroke();
    ctx.fillText(t.toFixed(1), margin.left - 40, y + 4);
  });

  ctx.save();
  ctx.translate(15, height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillText("Gj.snitt Visninger (Media)", 0, 0);
  ctx.restore();
}

canvas.addEventListener("click", evt => {
  const rect = canvas.getBoundingClientRect();
  const mx = evt.clientX - rect.left;
  const my = evt.clientY - rect.top;

  const zx = transform.rescaleX(xScale);
  const zy = transform.rescaleY(yScaleRaw);
  const r = 5;

  for (const d of filteredData) {
    const x = zx(d.percentage_digitized * 100);
    const y = zy(d.average_views_media);
    if (Math.abs(mx - x) < r && Math.abs(my - y) < r) {
      tooltip.style.left = `${evt.pageX + 10}px`;
      tooltip.style.top = `${evt.pageY + 10}px`;
      tooltip.style.display = "block";
      tooltip.innerHTML = `
        <strong>${d.navn}</strong><br/>
        (${d.identifikator})<br/>
        Digitalisert: ${(d.percentage_digitized * 100).toFixed(2)}%<br/>
        Visninger: ${d.average_views_media.toFixed(2)}
      `;
      return;
    }
  }

  tooltip.style.display = "none";
});
