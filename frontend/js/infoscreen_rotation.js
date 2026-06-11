const ROTATION_MS = 60 * 1000;

const ROTATION_TARGETS = {
  "/views/arkiv_infoscreen.html": "/views/worldcup_infoscreen.html",
  "/views/worldcup_infoscreen.html": "/views/arkiv_infoscreen.html",
};

function isRotationDisabled() {
  const params = new URLSearchParams(window.location.search);
  const value = (params.get("rotate") || "").trim().toLowerCase();
  return value === "0" || value === "false" || value === "off";
}

export function startInfoscreenRotation() {
  if (isRotationDisabled()) return null;

  const currentPath = window.location.pathname.toLowerCase();
  const targetPath = ROTATION_TARGETS[currentPath];
  if (!targetPath) return null;

  return window.setTimeout(() => {
    window.location.replace(targetPath);
  }, ROTATION_MS);
}

export function startEmbeddedInfoscreenRotation(viewSelector = "[data-infoscreen-view]") {
  if (isRotationDisabled()) return null;

  const views = Array.from(document.querySelectorAll(viewSelector));
  if (views.length < 2) return null;

  let activeIndex = views.findIndex(view => view.classList.contains("is-active"));
  if (activeIndex < 0) activeIndex = 0;

  function showView(index) {
    views.forEach((view, viewIndex) => {
      const isActive = viewIndex === index;
      view.classList.toggle("is-active", isActive);
      view.setAttribute("aria-hidden", isActive ? "false" : "true");
    });
  }

  showView(activeIndex);

  return window.setInterval(() => {
    activeIndex = (activeIndex + 1) % views.length;
    showView(activeIndex);
  }, ROTATION_MS);
}
