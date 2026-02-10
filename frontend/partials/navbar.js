(function () {
  const navbar = document.getElementById("navbar");
  if (!navbar) return;

  const navToggle = navbar.querySelector(".nav-toggle");
  const navMenu = navbar.querySelector("#nav-menu");

  function closeAllDropdowns(except = null) {
    navbar.querySelectorAll(".dropdown.open").forEach((dd) => {
      if (dd === except) return;
      dd.classList.remove("open");
      const btn = dd.querySelector(".dropdown-toggle");
      if (btn) btn.setAttribute("aria-expanded", "false");
    });
  }

  // Mobile menu toggle
  if (navToggle && navMenu) {
    navToggle.addEventListener("click", () => {
      const isOpen = navMenu.classList.toggle("open");
      navToggle.setAttribute("aria-expanded", String(isOpen));
      if (!isOpen) closeAllDropdowns();
    });
  }

  // Dropdown toggles
  navbar.querySelectorAll(".dropdown").forEach((dd) => {
    const btn = dd.querySelector(".dropdown-toggle");
    const menu = dd.querySelector(".dropdown-menu");
    if (!btn || !menu) return;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const willOpen = !dd.classList.contains("open");
      closeAllDropdowns(dd);
      dd.classList.toggle("open", willOpen);
      btn.setAttribute("aria-expanded", String(willOpen));
    });

    // Optional: open with ArrowDown when focused
    btn.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        closeAllDropdowns(dd);
        dd.classList.add("open");
        btn.setAttribute("aria-expanded", "true");
        const firstLink = menu.querySelector("a");
        firstLink?.focus();
      }
    });
  });

  // Close on outside click
  document.addEventListener("click", (e) => {
    if (!navbar.contains(e.target)) {
      closeAllDropdowns();
      if (navMenu) {
        navMenu.classList.remove("open");
        navToggle?.setAttribute("aria-expanded", "false");
      }
    }
  });

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    closeAllDropdowns();
    if (navMenu) {
      navMenu.classList.remove("open");
      navToggle?.setAttribute("aria-expanded", "false");
    }
  });
})();
