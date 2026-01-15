const svg = d3.select("#shelfCanvas");
const zoomGroup = d3.select("#zoomGroup");
const roomSelect = document.getElementById("roomSelect");

const zoom = d3.zoom()
  .scaleExtent([0.5, 5])
  .on("zoom", (event) => zoomGroup.attr("transform", event.transform));

svg.call(zoom);

// Layout config
const baySpacing = 220;
const shelfHeight = 25;
const shelfWidth = 200;
const aisleSpacing = 200;
const pillHeight = 10;
const pillPadding = 2;
let colorScale = null;

// -----------------------------------------------------
// STEP 1 — Load room list dynamically from API
// -----------------------------------------------------
fetch("https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net/api/rooms")
  .then(res => res.json())
  .then(rooms => {
    console.log("Rooms fetched:", rooms);  

    if (!Array.isArray(rooms)) return;

    rooms.sort().forEach(room => {
      const option = document.createElement("option");
      option.value = room;
      option.textContent = room;
      roomSelect.appendChild(option);
    });

    // Load first room on startup
    if (rooms.length > 0) {
      loadRoom(rooms[0]);
    }
  });

// -----------------------------------------------------
// STEP 2 — Re-render when room is changed by user
// -----------------------------------------------------
roomSelect.addEventListener("change", (e) => {
  loadRoom(e.target.value);
});

// -----------------------------------------------------
// STEP 3 — Fetch shelves + items for selected room
// -----------------------------------------------------
function loadRoom(room) {
  zoomGroup.selectAll("*").remove();

  Promise.all([
    fetch(`https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net/shelves?depot=OSL1&room=${room}`).then(res => res.json()),
    fetch(`https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net/api/items?depot=OSL1&room=${room}`).then(res => res.json())
  ]).then(([shelves, items]) => {
    drawShelves(shelves, items);
  });
}

// -----------------------------------------------------
// STEP 4 — Main rendering function
// -----------------------------------------------------
function drawShelves(shelfData, itemData) {

  // Parse shelf metadata
  const shelves = shelfData.map(d => {
    const parts = d.path.split("/");
    return {
      path: d.path,
      aisle: +parts[2],
      bay: +parts[3],
      shelf: +parts[4],
      total_space: +d.total_space
    };
  });

  // Group items by shelf
  const itemsByShelf = d3.group(itemData, d => d.shelf_path);

  // Unique color per archive
  const uniqueArkiv = Array.from(new Set(itemData.map(d => d.arkiv)));
  colorScale = d3.scaleOrdinal()
    .domain(uniqueArkiv)
    .range(d3.schemeSet2);

  // Group shelves by aisle
  const aisleGroups = d3.group(shelves, d => d.aisle);
  const sortedAisles = Array.from(aisleGroups.keys()).sort((a, b) => a - b);

  sortedAisles.forEach((aisle, aisleIndex) => {

    const bays = d3.group(aisleGroups.get(aisle), d => d.bay);
    const sortedBays = Array.from(bays.keys()).sort((a, b) => a - b);

    const aisleGroup = zoomGroup.append("g")
      .attr("transform", `translate(50, ${aisleIndex * aisleSpacing + 50})`);

    aisleGroup.append("text")
      .attr("x", 0)
      .attr("y", -15)
      .text(`Aisle ${aisle}`)
      .style("font-size", "14px")
      .style("font-weight", "bold");

    sortedBays.forEach((bay, bayIndex) => {

      const shelvesInBay = bays.get(bay).sort((a, b) => a.shelf - b.shelf);

      const bayGroup = aisleGroup.append("g")
        .attr("transform", `translate(${bayIndex * baySpacing}, 0)`);

      bayGroup.append("text")
        .attr("x", shelfWidth / 2)
        .attr("y", -5)
        .attr("text-anchor", "middle")
        .style("font-size", "12px")
        .text(`Bay ${bay}`);

      // Draw each shelf box
      shelvesInBay.forEach((shelfData, shelfIndex) => {

        const shelfY = shelfIndex * shelfHeight;

        bayGroup.append("rect")
          .attr("x", 0)
          .attr("y", shelfY)
          .attr("width", shelfWidth)
          .attr("height", shelfHeight - 2)
          .attr("fill", "#f0f0f0")
          .attr("stroke", "black");

        // Items in this shelf
        const items = (itemsByShelf.get(shelfData.path) || [])
        .sort((a, b) => (a.shelf_path || "").localeCompare(b.shelf_path || ""));

        if (items.length > 0) {

          const availableWidth = shelfWidth - pillPadding * 2;

          // ✔ Dynamic pill width scaling
          const idealPillWidth = (availableWidth / items.length) - pillPadding;
          const pillWidth = Math.max(4, Math.min(idealPillWidth, 16));

          const maxPillsThatFit = Math.floor((availableWidth + pillPadding) / (pillWidth + pillPadding));

          // Draw pills that fit
          items.slice(0, maxPillsThatFit).forEach((item, i) => {
            const x = pillPadding + i * (pillWidth + pillPadding);

            bayGroup.append("rect")
              .attr("x", x)
              .attr("y", shelfY + 2)
              .attr("width", pillWidth)
              .attr("height", pillHeight)
              .attr("fill", colorScale(item.arkiv))
              .attr("rx", 3)
              .attr("ry", 3)
              .append("title")
              .text(`Path: ${item.item_path || "unknown"}\nArkiv: ${item.arkiv}\nItem: ${item.item_id}`);


          });

          // ✔ Add a "+N" indicator for overflow items
          const hiddenCount = items.length - maxPillsThatFit;
          if (hiddenCount > 0) {
            bayGroup.append("text")
              .attr("x", shelfWidth - 4)
              .attr("y", shelfY + 10)
              .attr("text-anchor", "end")
              .attr("fill", "#333")
              .attr("font-size", "10px")
              .text(`+${hiddenCount}`);
          }
        }
      });
    });
  });
}
