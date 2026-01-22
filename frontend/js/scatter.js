const svg = d3.select("#scatterPlot");
const tooltip = d3.select("#customTooltip");
const filter = document.getElementById("lokasjonFilter");
let fullData = [];

const margin = { top: 40, right: 40, bottom: 50, left: 60 };
const width = svg.node().clientWidth - margin.left - margin.right;
const height = svg.node().clientHeight - margin.top - margin.bottom;

const chartArea = svg.append("g")
  .attr("transform", `translate(${margin.left},${margin.top})`);

const xScale = d3.scaleLinear().range([0, width]).domain([0, 100]);
const yScale = d3.scaleLinear().range([height, 0]).domain([0, 20]);

const xAxis = d3.axisBottom(xScale).ticks(10).tickFormat(d => `${d}%`);
const yAxis = d3.axisLeft(yScale);

const xAxisGroup = chartArea.append("g")
  .attr("transform", `translate(0,${height})`)
  .call(xAxis);

const yAxisGroup = chartArea.append("g")
  .call(yAxis);

chartArea.append("text")
  .attr("x", width / 2)
  .attr("y", height + 40)
  .attr("text-anchor", "middle")
  .text("Digitaliseringsgrad (%)");

chartArea.append("text")
  .attr("transform", "rotate(-90)")
  .attr("y", -50)
  .attr("x", -height / 2)
  .attr("text-anchor", "middle")
  .text("Gj.snitt Visninger (Media)");

const zoom = d3.zoom()
  .scaleExtent([0.5, 20])
  .on("zoom", zoomed);

svg.call(zoom);

function zoomed(event) {
  const t = event.transform;
  const zx = t.rescaleX(xScale);
  const zy = t.rescaleY(yScale);

  xAxisGroup.call(xAxis.scale(zx));
  yAxisGroup.call(yAxis.scale(zy));

  chartArea.selectAll("circle")
    .attr("cx", d => zx(d.percentage_digitized * 100))
    .attr("cy", d => zy(d.average_views_media));
}

fetch("https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net/api/scatter-data")
  .then(res => res.json())
  .then(data => {
    fullData = data.filter(d => d.percentage_digitized !== null && d.average_views_media !== null);
    populateFilter(fullData);
    drawPoints(fullData);
  });

function populateFilter(data) {
  const lokasjoner = Array.from(new Set(data.map(d => d.lokasjon).filter(Boolean))).sort();
  for (const l of lokasjoner) {
    const option = document.createElement("option");
    option.value = l;
    option.textContent = l;
    filter.appendChild(option);
  }

  filter.addEventListener("change", () => {
    const value = filter.value;
    const filtered = value === "ALL" ? fullData : fullData.filter(d => d.lokasjon === value);
    drawPoints(filtered);
  });
}

function drawPoints(data) {
  chartArea.selectAll("circle").remove();

  chartArea.selectAll("circle")
    .data(data)
    .enter()
    .append("circle")
    .attr("r", 5)
    .attr("cx", d => xScale(d.percentage_digitized * 100))
    .attr("cy", d => yScale(d.average_views_media))
    .attr("fill", "steelblue")
    .style("cursor", "pointer")
    .on("click", (event, d) => {
      tooltip
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY + 10 + "px")
        .style("display", "block")
        .html(`
          <strong>${d.navn}</strong><br/>
          (${d.identifikator})<br/>
          Digitalisert: ${(d.percentage_digitized * 100).toFixed(2)}%<br/>
          Visninger: ${d.average_views_media.toFixed(2)}
        `);
    });

  svg.on("click", e => {
    if (e.target.tagName !== "circle") {
      tooltip.style("display", "none");
    }
  });
}
