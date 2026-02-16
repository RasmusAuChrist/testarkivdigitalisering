document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("validation-container");
  const overlay = document.getElementById("loadingOverlay");
  const refreshBtn = document.getElementById("refreshBtn");
  const refreshStatus = document.getElementById("refreshStatus");

  const API_BASE = "https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net";

  function setLoading(isLoading) {
    overlay.style.display = isLoading ? "flex" : "none";
  }

  function setStatus(msg, isError = false) {
    if (!refreshStatus) return;
    refreshStatus.textContent = msg || "";
    refreshStatus.style.color = isError ? "#ff6b6b" : "#bbb";
  }

  function render(data) {
    container.innerHTML = "";

    if (!data.length) {
      container.innerHTML = "<p>Ingen manglende datoer funnet 🎉</p>";
      return;
    }

    // ✅ Sort by ordre, then serie_path
    data.sort((a, b) => {
      if (a.ordre !== b.ordre) return a.ordre - b.ordre;
      return a.serie_path.localeCompare(b.serie_path);
    });

    data.forEach(entry => {
      const wrapper = document.createElement("div");
      wrapper.style.marginBottom = "12px";
      wrapper.style.borderBottom = "1px solid #444";

      const toggleIcon = document.createElement("span");
      toggleIcon.textContent = "➕";
      toggleIcon.style.marginRight = "8px";

      // ✅ Build warnings (with strict value check)
      const warnings = [];
      if (entry.ordre_startdato_ok === false) warnings.push("⚠️ Startdato mangler på serienivå");
      if (entry.ordre_sluttdato_ok === false) warnings.push("⚠️ Sluttdato mangler på serienivå");
      if (entry.ordre_hyllemeter_ok === false) warnings.push("⚠️ Hyllemeter mangler på serienivå");

      const header = document.createElement("button");
      header.innerHTML = "";
      header.appendChild(toggleIcon);
      header.appendChild(document.createTextNode(
        `Ordre ${entry.ordre}: ${entry.serie_path} (${entry.missing_count} stykker mangler start-/sluttdato)`
      ));

      if (warnings.length) {
        const warnText = document.createElement("span");
        warnText.style.color = "red";
        warnText.style.marginLeft = "12px";
        warnText.style.fontWeight = "bold";
        warnText.textContent = warnings.join(" | ");
        header.appendChild(warnText);
      }

      header.style.background = "#111";
      header.style.color = "#fdd835";
      header.style.padding = "10px";
      header.style.border = "none";
      header.style.cursor = "pointer";
      header.style.width = "100%";
      header.style.textAlign = "left";
      header.style.fontSize = "16px";

      const details = document.createElement("div");
      details.style.display = "none";
      details.style.padding = "10px";
      details.style.background = "#222";

      (entry.missing_items || []).sort((a, b) =>
        (a.identifikator || "").localeCompare(b.identifikator || "")
      );

      const ul = document.createElement("ul");
      (entry.missing_items || []).forEach(item => {
        const li = document.createElement("li");
        li.textContent = item.identifikator;
        li.style.color = "white";
        ul.appendChild(li);
      });

      details.appendChild(ul);

      header.addEventListener("click", () => {
        const isOpen = details.style.display === "block";
        details.style.display = isOpen ? "none" : "block";
        toggleIcon.textContent = isOpen ? "➕" : "➖";
      });

      wrapper.appendChild(header);
      wrapper.appendChild(details);
      container.appendChild(wrapper);
    });
  }

  async function loadValidation() {
    setLoading(true);
    setStatus("");
    try {
      const res = await fetch(`${API_BASE}/api/validation-status`);
      const data = await res.json();

      if (data && data.error) {
        container.innerHTML = "<p style='color: red;'>Kunne ikke hente data. 😢</p>";
        console.error("Validation error:", data.error);
        return;
      }

      render(Array.isArray(data) ? data : []);
    } catch (err) {
      container.innerHTML = "<p style='color: red;'>Kunne ikke hente data. 😢</p>";
      console.error("Validation fetch failed", err);
    } finally {
      setLoading(false);
    }
  }

async function refreshValidation() {
  refreshBtn.disabled = true;
  setStatus("Oppdaterer…");
  setLoading(true);

  try {
    const res = await fetch(`${API_BASE}/api/validation-status/refresh`, { method: "POST" });
    const out = await res.json();

    console.log("Refresh response:", out);

    if (!res.ok || out.ok !== true) {
      setStatus(out?.error || `Refresh feilet (HTTP ${res.status})`, true);
      return;
    }

    setStatus(`Oppdatert ✅ (${out.count.toLocaleString("no-NO")} rader)`);
    await loadValidation();
  } catch (err) {
    setStatus("Refresh feilet 😢", true);
    console.error(err);
  } finally {
    setLoading(false);
    refreshBtn.disabled = false;
  }
}

  if (refreshBtn) {
    refreshBtn.addEventListener("click", refreshValidation);
  }

  // initial load
  loadValidation();
});
