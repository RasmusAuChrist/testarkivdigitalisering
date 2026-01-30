// frontend/js/validation.js
document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("validation-container");
  const overlay = document.getElementById("loadingOverlay");

  fetch("/api/validation-status")
    .then(res => res.json())
    .then(data => {
      overlay.style.display = "none";

      if (!data.length) {
        container.innerHTML = "<p>Ingen manglende datoer funnet 🎉</p>";
        return;
      }

      data.forEach(entry => {
        const wrapper = document.createElement("div");
        wrapper.style.marginBottom = "12px";
        wrapper.style.borderBottom = "1px solid #444";

        const header = document.createElement("button");
        header.textContent = `Ordre ${entry.ordre}: ${entry.serie_path} (${entry.missing_count} mangler)`;
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

        const ul = document.createElement("ul");
        entry.missing_items.forEach(item => {
          const li = document.createElement("li");
          li.textContent = item.identifikator;
          li.style.color = "white";
          ul.appendChild(li);
        });

        details.appendChild(ul);
        header.addEventListener("click", () => {
          details.style.display = details.style.display === "none" ? "block" : "none";
        });

        wrapper.appendChild(header);
        wrapper.appendChild(details);
        container.appendChild(wrapper);
      });
    })
    .catch(err => {
      overlay.style.display = "none";
      container.innerHTML = "<p style='color: red;'>Kunne ikke hente data. 😢</p>";
      console.error("Validation fetch failed", err);
    });
});
