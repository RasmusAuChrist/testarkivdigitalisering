const ROTATION_MS = 30 * 60 * 1000;

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
