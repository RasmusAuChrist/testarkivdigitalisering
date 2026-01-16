// Canvas-based shelf renderer using D3 for layout

const canvas = document.getElementById("shelfCanvas");
const ctx = canvas.getContext("2d");
const roomSelect = document.getElementById("roomSelect");

const baySpacing = 220;
const shelfHeight = 25;
const shelfWidth = 200;
const aisleSpacing = 200;
const pillHeight = 10;
const pillPadding = 2;
let colorScale = null;

canvas.width = window.innerWidth * 2;
canvas.height = window.innerHeight * 2;

// Zoom / pan config
let zoomX = 0;
let zoomY = 0;
let scale = 1;

function drawText(text, x, y, color = "black", size = 12, bold = false) {
  ctx.fillStyle = color;
  ctx.font = `${bold ? "bold" : ""} ${size}px sans-serif`;
  ctx.fillText(text, x, y);
}

function clearCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function setupZoom() {
  let isDragging = false;
  let lastX = 0, lastY = 0;

  canvas.addEventListener("mousedown", e => {
    isDragging = true;
    lastX = e.offsetX;
    lastY = e.offsetY;
  });
  canvas.addEventListener("mouseup", () => isDragging = false);
  canvas.addEventListener("mouseout", () => isDragging = false);

  canvas.addEventListener("mousemove", e => {
    if (isDragging) {
      zoomX += (e.offsetX - lastX);
      zoomY += (e.offsetY - lastY);
      lastX = e.offsetX;
      lastY = e.offsetY;
      draw();
    }
  });

  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    scale *= delta;
    draw();
  });
}

// API Fetch logic
fetch("https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net/api/rooms")
  .then(res => res.json())
  .then(rooms => {
    rooms.sort().forEach(room => {
      const option = document.createElement("option");
      option.value = room;
      option.textContent = room;
      roomSelect.appendChild(option);
    });
    if (rooms.length > 0) loadRoom(rooms[0]);
  });

roomSelect.addEventListener("change", e => loadRoom(e.target.value));

let globalShelves = [], globalItems = [];

function loadRoom(room) {
  Promise.all([
    fetch(`https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net/api/shelves?depot=OSL1&room=${room}`).then(res => res.json()),
    fetch(`https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net/api/items?depot=OSL1&room=${room}`).then(res => res.json())
  ]).then(([shelves, items]) => {
    globalShelves = shelves.map(d => {
      const parts = d.path.split("/");
      return {
        ...d,
        aisle: +parts[2],
        bay: +parts[3],
        shelf: +parts[4],
      };
    });
    globalItems = items;
    draw();
  });
}

function draw() {
  clearCanvas();
  ctx.save();
  ctx.translate(zoomX, zoomY);
  ctx.scale(scale, scale);

  const itemsByShelf = d3.group(globalItems, d => d.shelf_path);
  const uniqueArkiv = Array.from(new Set(globalItems.map(d => d.arkiv)));
  colorScale = d3.scaleOrdinal().domain(uniqueArkiv).range(d3.schemeSet2);

  const aisleGroups = d3.group(globalShelves, d => d.aisle);
  const sortedAisles = Array.from(aisleGroups.keys()).sort((a, b) => a - b);

  sortedAisles.forEach((aisle, aisleIndex) => {
    const bays = d3.group(aisleGroups.get(aisle), d => d.bay);
    const sortedBays = Array.from(bays.keys()).sort((a, b) => a - b);

    const baseY = aisleIndex * aisleSpacing + 50;
    drawText(`Aisle ${aisle}`, 20, baseY - 15, "black", 14, true);

    sortedBays.forEach((bay, bayIndex) => {
      const shelves = bays.get(bay).sort((a, b) => a.shelf - b.shelf);
      const baseX = bayIndex * baySpacing + 100;

      drawText(`Bay ${bay}`, baseX + shelfWidth / 2 - 20, baseY - 5);

      shelves.forEach((shelf, shelfIndex) => {
        const shelfY = baseY + shelfIndex * shelfHeight;

        ctx.fillStyle = "#f0f0f0";
        ctx.strokeStyle = "black";
        ctx.fillRect(baseX, shelfY, shelfWidth, shelfHeight - 2);
        ctx.strokeRect(baseX, shelfY, shelfWidth, shelfHeight - 2);

        const items = (itemsByShelf.get(shelf.path) || []).sort((a, b) => (a.item_id || "").localeCompare(b.item_id || ""));

        if (items.length > 0) {
          const availableWidth = shelfWidth - pillPadding * 2;
          const pillWidth = Math.max(4, Math.min((availableWidth / items.length) - pillPadding, 16));
          const maxFit = Math.floor((availableWidth + pillPadding) / (pillWidth + pillPadding));

          items.slice(0, maxFit).forEach((item, i) => {
            const x = baseX + pillPadding + i * (pillWidth + pillPadding);
            ctx.fillStyle = colorScale(item.arkiv);
            ctx.fillRect(x, shelfY + 2, pillWidth, pillHeight);
          });

          if (items.length > maxFit) {
            drawText(`+${items.length - maxFit}`, baseX + shelfWidth - 20, shelfY + 12, "#333", 10);
          }
        }
      });
    });
  });

  ctx.restore();
}

setupZoom();
