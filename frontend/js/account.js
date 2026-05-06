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
    return;
  }

  document.getElementById("changePwdBtn").addEventListener("click", async () => {
    try {
      const old_password = document.getElementById("oldPwd").value;
      const new_password = document.getElementById("newPwd").value;
      const new_password2 = document.getElementById("newPwd2").value;

      if (!old_password || !new_password || !new_password2) {
        return setMsg("Fyll ut alle passordfeltene.", true);
      }

      if (new_password.length < 6) {
        return setMsg("Nytt passord må være minst 6 tegn.", true);
      }

      if (new_password !== new_password2) {
        return setMsg("Nytt passord er ikke likt i begge feltene.", true);
      }

      setMsg("Endrer passord…");

      await apiPost("/account/change-password", {
        old_password,
        new_password,
      });

      document.getElementById("oldPwd").value = "";
      document.getElementById("newPwd").value = "";
      document.getElementById("newPwd2").value = "";
      document.getElementById("mustChangeBox").style.display = "none";

      setMsg("Passordet er endret.");
    } catch (e) {
      setMsg(e.message || "Kunne ikke endre passord.", true);
    }
  });

  document.getElementById("saveNotifyPrefsBtn").addEventListener("click", async () => {
    try {
      const notify_by_email = document.getElementById("notifyEmail").checked;
      const notify_by_teams = document.getElementById("notifyTeams").checked;

      setMsg("Lagrer varslinger…");

      await apiPost("/account/notification-preferences", {
        notify_by_email,
        notify_by_teams,
      });

      setMsg("Varslinger er lagret.");
    } catch (e) {
      setMsg(e.message || "Kunne ikke lagre varslinger.", true);
    }
  });
});