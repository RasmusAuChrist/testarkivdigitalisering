// tooltip.js

export function createTooltip(canvas, getZoom, getPillHitboxes) {
  const tooltip = document.createElement("div");
  tooltip.style.position = "absolute";
  tooltip.style.padding = "4px 8px";
  tooltip.style.background = "#333";
  tooltip.style.color = "#fff";
  tooltip.style.borderRadius = "4px";
  tooltip.style.pointerEvents = "none";
  tooltip.style.fontSize = "12px";
  tooltip.style.display = "none";
  tooltip.style.zIndex = "100";
  document.body.appendChild(tooltip);

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const { zoomX, zoomY, scale } = getZoom();
    const mouseX = (e.clientX - rect.left - zoomX) / scale;
    const mouseY = (e.clientY - rect.top - zoomY) / scale;

    const hit = getPillHitboxes().find(p =>
      mouseX >= p.x &&
      mouseX <= p.x + p.width &&
      mouseY >= p.y &&
      mouseY <= p.y + p.height
    );

    if (hit) {
    tooltip.style.left = `${e.clientX + 10}px`;
    tooltip.style.top = `${e.clientY + 10}px`;
    tooltip.textContent = hit.data.item_path || "No path";
    tooltip.style.display = "block";
    } else {
    tooltip.style.display = "none";
    }
  });

  canvas.addEventListener("mouseleave", () => {
    tooltip.style.display = "none";
  });
}
