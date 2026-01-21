document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    document.getElementById("splash-screen").style.display = "none";
    document.getElementById("main-content").style.display = "block";
  }, 2000); // 2 seconds
});

document.addEventListener("DOMContentLoaded", () => {
  console.log("Dashboard loaded");

  // Example: wire a button to open location viewer
  const goBtn = document.getElementById("go-to-location");
  if (goBtn) {
    goBtn.addEventListener("click", () => {
      window.location.href = "views/location.html";
    });
  }
});
