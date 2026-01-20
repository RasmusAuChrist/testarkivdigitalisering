import { createTooltip } from "./tooltip.js";

const aisleSpacing = 200;
const pillHeight = 10;
const pillPadding = 2;

// Zoom / Pan
let zoomX = 0;
let zoomY = 0;
let scale = 1;

// State
let currentDepot = null;
let currentRoom = null;
let filterPath = "";

// Data
let globalShelves = [];
let globalItems = [];
let colorScale = null;
let pillHitboxes = [];

// Init
setupZoom();
setupEvents();
createTooltip(canvas, () => ({ zoomX, zoomY, scale }), () => pillHitboxes);
loadDepots();

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
  canvas.addEventListener("mouseleave", () => isDragging = false);

  canvas.addEventListener("mousemove", e => {
    if (!isDragging) return;
    zoomX += e.offsetX - lastX;
    zoomY += e.offsetY - lastY;
    lastX = e.offsetX;
    lastY = e.offsetY;
    draw();
  });

  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    scale *= e.deltaY > 0 ? 0.9 : 1.1;
    draw();
  });
}

function setupEvents() {
  pathFilterInput.addEventListener("input", e => {
    filterPath = e.target.value.trim();
    draw();
  });

  depotSelect.addEventListener("change", e => {
    currentDepot = e.target.value;
    loadRooms(currentDepot);
  });

  roomSelect.addEventListener("change", e => {
    currentRoom = e.target.value;
    loadRoom(currentDepot, currentRoom);
  });
}

function loadDepots() {
  showLoading();
  fetch("/api/depots")
    .then(res => res.json())
    .then(depots => {
      depots.sort().forEach(depot => {
        const opt = document.createElement("option");
        opt.value = depot;
        opt.textContent = depot;
        depotSelect.appendChild(opt);
      });

      if (depots.length) {
        currentDepot = depots[0];
        depotSelect.value = currentDepot;
        loadRooms(currentDepot);
      } else {
        hideLoading();
      }
    })
    .catch(err => {
      console.error("Error loading depots:", err);
      hideLoading();
    });
}

function loadRooms(depot) {
  showLoading();
  roomSelect.innerHTML = "";

  fetch(`/api/rooms?depot=${encodeURIComponent(depot)}`)
    .then(res => res.json())
    .then(rooms => {
      rooms.sort().forEach(room => {
        const opt = document.createElement("option");
        opt.value = room;
        opt.textContent = room;
        roomSelect.appendChild(opt);
      });

      if (rooms.length) {
        currentRoom = rooms[0];
        roomSelect.value = currentRoom;
        loadRoom(currentDepot, currentRoom);
      } else {
        hideLoading();
      }
    })
    .catch(err => {
      console.error("Error loading rooms:", err);
      hideLoading();
    });
}

function loadRoom(depot, room) {
  showLoading();

  Promise.all([
    fetch(`/api/shelves?depot=${depot}&room=${room}`).then(r => r.json()),
    fetch(`/api/items?depot=${depot}&room=${room}`).then(r => r.json())
  ])
    .then(([shelves, items]) => {
      globalShelves = shelves.map(d => {
        const parts = d.path.split("/");
        return {
          ...d,
          aisle: +parts[2],
          bay: +parts[3],
          shelf: +parts[4]
        };
      });

      globalItems = items;
      draw();
      hideLoading();
    })
    .catch(err => {
      console.error("Error loading room data:", err);
      hideLoading();
    });
}

function draw() {
  clearCanvas();
  pillHitboxes = [];

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

        const items = (itemsByShelf.get(shelf.path) || []).sort((a, b) =>
          (a.item_id || "").localeCompare(b.item_id || "")
        );

        const availableWidth = shelfWidth - pillPadding * 2;
        const pillWidth = Math.max(4, Math.min((availableWidth / items.length) - pillPadding, 16));
        const maxFit = Math.floor((availableWidth + pillPadding) / (pillWidth + pillPadding));

        items.slice(0, maxFit).forEach((item, i) => {
          const x = baseX + pillPadding + i * (pillWidth + pillPadding);
          const y = shelfY + 2;

          const matches = !filterPath || item.arkiv?.startsWith(filterPath);
          ctx.globalAlpha = matches ? 1 : 0.2;
          ctx.fillStyle = colorScale(item.arkiv);
          ctx.fillRect(x, y, pillWidth, pillHeight);
          ctx.globalAlpha = 1;

          if (matches && filterPath) {
            ctx.strokeStyle = "red";
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, pillWidth, pillHeight);
          }

          pillHitboxes.push({ x, y, width: pillWidth, height: pillHeight, data: item });
        });

        if (items.length > maxFit) {
          drawText(`+${items.length - maxFit}`, baseX + shelfWidth - 20, shelfY + 12, "#333", 10);
        }
      });
    });
  });

  ctx.restore();
}
