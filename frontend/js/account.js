import { initProtectedPage, apiPost } from "./page_auth.js";

function setMsg(text, isError = false) {
  const el = document.getElementById("msg");
  el.textContent = text || "";
  el.style.color = isError ? "#ffb4b4" : "#ffffff";
}

document.addEventListener("DOMContentLoaded", async () => {
  let me;

  try {
    setMsg("Laster…");
    me = await initProtectedPage();
    if (!me) return;

    document.getElementById("notifyEmail").checked = !!me.notify_by_email;
    document.getElementById("notifyTeams").checked = !!me.notify_by_teams;

    document.getElementById("profileBox").innerHTML = `
      <div><b>Brukernavn:</b> ${me.username}</div>
      <div><b>Roller:</b> ${(me.roles || []).join(", ")}</div>
    `;

    if (me.must_change_password) {
      document.getElementById("mustChangeBox").style.display = "block";
    }

    setMsg("");
  } catch (e) {
    setMsg(e.message || "Feil", true);
  }
});