import { initProtectedPage, apiGet } from "./page_auth.js";

const REFRESH_MS = 60 * 1000;
const GROUP_ROTATE_MS = 12 * 1000;

const el = {
  clockPill: document.getElementById("clockPill"),
  refreshPill: document.getElementById("refreshPill"),
  statusPill: document.getElementById("statusPill"),
  loadingOverlay: document.getElementById("loadingOverlay"),

  kpiMatches: document.getElementById("kpiMatches"),
  kpiLive: document.getElementById("kpiLive"),
  kpiFinished: document.getElementById("kpiFinished"),
  kpiGoals: document.getElementById("kpiGoals"),

  featuredTitle: document.getElementById("featuredTitle"),
  featuredSub: document.getElementById("featuredSub"),
  featuredTag: document.getElementById("featuredTag"),
  featuredHome: document.getElementById("featuredHome"),
  featuredAway: document.getElementById("featuredAway"),
  featuredScore: document.getElementById("featuredScore"),
  featuredMeta: document.getElementById("featuredMeta"),

  todaySub: document.getElementById("todaySub"),
  todayList: document.getElementById("todayList"),
  gamesTicker: document.getElementById("gamesTicker"),
  groupTitle: document.getElementById("groupTitle"),
  groupTable: document.getElementById("groupTable"),
};

const state = {
  games: [],
  groups: [],
  groupIndex: 0,
  timers: {
    clock: null,
    refresh: null,
    group: null,
  },
};

function showLoading() {
  el.loadingOverlay?.classList.add("show");
}

function hideLoading() {
  el.loadingOverlay?.classList.remove("show");
}

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function int(value) {
  return Math.round(toNum(value)).toLocaleString("no-NO");
}

function safeText(value) {
  return String(value ?? "").trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parseBool(value) {
  return String(value ?? "").trim().toLowerCase() === "true";
}

function parseGameDate(value) {
  const raw = safeText(value);
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const [, month, day, year, hour, minute] = match;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute)
  );
}

function formatDateTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("no-NO", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatTime(date = new Date()) {
  return new Intl.DateTimeFormat("no-NO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatClockTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("no-NO", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function isSameDate(a, b) {
  return (
    a instanceof Date &&
    b instanceof Date &&
    !Number.isNaN(a.getTime()) &&
    !Number.isNaN(b.getTime()) &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getGameStatus(game) {
  if (game.finished) return "finished";
  if (game.time_elapsed && game.time_elapsed !== "notstarted") return "live";
  return "upcoming";
}

function getStatusLabel(game) {
  const status = getGameStatus(game);
  if (status === "finished") return "Ferdig";
  if (status === "live") return `${game.time_elapsed}'`;
  return "Kommer";
}

function normalizeGame(row) {
  const date = parseGameDate(row.local_date);
  const homeScore = toNum(row.home_score);
  const awayScore = toNum(row.away_score);

  return {
    ...row,
    id: safeText(row.id),
    group: safeText(row.group),
    matchday: safeText(row.matchday),
    type: safeText(row.type),
    home_team_id: safeText(row.home_team_id),
    away_team_id: safeText(row.away_team_id),
    home_team_name_en: safeText(row.home_team_name_en),
    away_team_name_en: safeText(row.away_team_name_en),
    home_score: homeScore,
    away_score: awayScore,
    finished: parseBool(row.finished),
    time_elapsed: safeText(row.time_elapsed).toLowerCase(),
    date,
    timestamp: date ? date.getTime() : Number.MAX_SAFE_INTEGER,
    total_goals: homeScore + awayScore,
  };
}

function buildTeamMap(games) {
  const map = new Map();
  for (const game of games) {
    if (game.home_team_id && game.home_team_name_en) {
      map.set(game.home_team_id, game.home_team_name_en);
    }
    if (game.away_team_id && game.away_team_name_en) {
      map.set(game.away_team_id, game.away_team_name_en);
    }
  }
  return map;
}

function normalizeGroups(groups, teamMap) {
  return [...groups]
    .map(group => ({
      name: safeText(group.name),
      teams: (group.teams || [])
        .map(team => ({
          team_id: safeText(team.team_id),
          name: teamMap.get(safeText(team.team_id)) || `Team ${team.team_id}`,
          mp: toNum(team.mp),
          w: toNum(team.w),
          d: toNum(team.d),
          l: toNum(team.l),
          pts: toNum(team.pts),
          gf: toNum(team.gf),
          ga: toNum(team.ga),
          gd: toNum(team.gd),
        }))
        .sort((a, b) =>
          b.pts - a.pts ||
          b.gd - a.gd ||
          b.gf - a.gf ||
          a.name.localeCompare(b.name, "no")
        ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "no"));
}

function scoreText(game) {
  return `${game.home_score} - ${game.away_score}`;
}

function renderKpis(games) {
  const live = games.filter(game => getGameStatus(game) === "live").length;
  const finished = games.filter(game => game.finished).length;
  const goals = games.reduce((sum, game) => sum + game.total_goals, 0);

  el.kpiMatches.textContent = int(games.length);
  el.kpiLive.textContent = int(live);
  el.kpiFinished.textContent = int(finished);
  el.kpiGoals.textContent = int(goals);

  el.statusPill.textContent = live ? `${live} live` : "Ingen livekamper";
  el.statusPill.classList.toggle("live", live > 0);
}

function selectFeaturedGame(games) {
  const now = Date.now();
  const live = games.find(game => getGameStatus(game) === "live");
  if (live) return live;

  const upcoming = games.find(game => !game.finished && game.timestamp >= now);
  if (upcoming) return upcoming;

  return [...games].reverse().find(game => game.finished) || games[0] || null;
}

function renderFeatured(games) {
  const game = selectFeaturedGame(games);
  if (!game) {
    el.featuredTitle.textContent = "Ingen kamper";
    el.featuredHome.textContent = "-";
    el.featuredAway.textContent = "-";
    el.featuredScore.textContent = "-";
    el.featuredMeta.innerHTML = "";
    return;
  }

  const status = getGameStatus(game);
  el.featuredTitle.textContent =
    status === "live" ? "Live nå" : status === "finished" ? "Siste resultat" : "Neste kamp";
  el.featuredSub.textContent = `Gruppe ${game.group || "-"} · kampdag ${game.matchday || "-"}`;
  el.featuredTag.textContent = getStatusLabel(game);
  el.featuredHome.textContent = game.home_team_name_en;
  el.featuredAway.textContent = game.away_team_name_en;
  el.featuredScore.textContent = scoreText(game);
  el.featuredMeta.innerHTML = [
    formatDateTime(game.date),
    game.type || "group",
    `kamp ${game.id || "-"}`,
  ]
    .filter(Boolean)
    .map(item => `<span>${escapeHtml(item)}</span>`)
    .join("");
}

function renderMatchRows(host, games, emptyText) {
  if (!games.length) {
    host.innerHTML = `
      <div class="match-row">
        <div class="match-teams">${escapeHtml(emptyText)}</div>
      </div>
    `;
    return;
  }

  host.innerHTML = games.map(game => {
    const status = getGameStatus(game);
    return `
      <div class="match-row">
        <div class="match-time">${escapeHtml(formatClockTime(game.date))}</div>
        <div class="match-teams">
          <div>${escapeHtml(game.home_team_name_en)}</div>
          <div>${escapeHtml(game.away_team_name_en)}</div>
        </div>
        <div style="display:grid; gap:5px; justify-items:end;">
          <div class="match-score">${escapeHtml(scoreText(game))}</div>
          <div class="status ${status}">${escapeHtml(getStatusLabel(game))}</div>
        </div>
      </div>
    `;
  }).join("");
}

function renderToday(games) {
  const today = new Date();
  const todaysGames = games.filter(game => isSameDate(game.date, today));

  if (todaysGames.length) {
    el.todaySub.textContent = "Kamper på dagens dato";
    renderMatchRows(el.todayList, todaysGames.slice(0, 5), "Ingen kamper i dag");
    return;
  }

  el.todaySub.textContent = "Ingen kamper i dag - viser neste kamper";
  const upcoming = games
    .filter(game => !game.finished && game.timestamp >= Date.now())
    .slice(0, 5);
  renderMatchRows(el.todayList, upcoming, "Ingen kommende kamper funnet");
}

function renderTicker(games) {
  const now = Date.now();
  const upcoming = games
    .filter(game => !game.finished && game.timestamp >= now)
    .slice(0, 4);
  const latestFinished = [...games]
    .filter(game => game.finished)
    .reverse()
    .slice(0, 2);
  const items = [...upcoming, ...latestFinished].slice(0, 6);

  if (!items.length) {
    el.gamesTicker.innerHTML = `
      <div class="ticker-row">
        <div class="ticker-teams">Ingen kampdata</div>
      </div>
    `;
    return;
  }

  el.gamesTicker.innerHTML = items.map(game => `
    <div class="ticker-row">
      <div class="ticker-date">${escapeHtml(formatClockTime(game.date))}</div>
      <div class="ticker-teams">
        ${escapeHtml(game.home_team_name_en)} - ${escapeHtml(game.away_team_name_en)}
      </div>
      <div class="ticker-score">${escapeHtml(scoreText(game))}</div>
    </div>
  `).join("");
}

function renderCurrentGroup() {
  if (!state.groups.length) {
    el.groupTitle.textContent = "Grupper";
    el.groupTable.innerHTML = `<div style="color:var(--muted);">Ingen gruppedata</div>`;
    return;
  }

  const group = state.groups[state.groupIndex % state.groups.length];
  el.groupTitle.textContent = `Gruppe ${group.name}`;
  el.groupTable.innerHTML = `
    <table class="standings-table">
      <thead>
        <tr>
          <th>Lag</th>
          <th>MP</th>
          <th>W</th>
          <th>D</th>
          <th>L</th>
          <th>GD</th>
          <th>PTS</th>
        </tr>
      </thead>
      <tbody>
        ${group.teams.map(team => `
          <tr>
            <td class="team">${escapeHtml(team.name)}</td>
            <td>${int(team.mp)}</td>
            <td>${int(team.w)}</td>
            <td>${int(team.d)}</td>
            <td>${int(team.l)}</td>
            <td>${int(team.gd)}</td>
            <td><strong>${int(team.pts)}</strong></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function updateClock() {
  el.clockPill.textContent = formatTime(new Date());
}

function clearTimers() {
  for (const timer of Object.values(state.timers)) {
    if (timer) clearInterval(timer);
  }
}

function startTimers() {
  clearTimers();
  updateClock();

  state.timers.clock = setInterval(updateClock, 30 * 1000);
  state.timers.refresh = setInterval(loadDashboard, REFRESH_MS);
  state.timers.group = setInterval(() => {
    if (!state.groups.length) return;
    state.groupIndex = (state.groupIndex + 1) % state.groups.length;
    renderCurrentGroup();
  }, GROUP_ROTATE_MS);
}

async function loadDashboard() {
  showLoading();
  el.refreshPill.textContent = "Oppdaterer data...";

  try {
    const [gamesPayload, groupsPayload] = await Promise.all([
      apiGet("/api/worldcup/games"),
      apiGet("/api/worldcup/groups"),
    ]);

    const games = (gamesPayload.games || [])
      .map(normalizeGame)
      .sort((a, b) => a.timestamp - b.timestamp || Number(a.id) - Number(b.id));
    const teamMap = buildTeamMap(games);
    const groups = normalizeGroups(groupsPayload.groups || [], teamMap);

    state.games = games;
    state.groups = groups;
    state.groupIndex = Math.min(state.groupIndex, Math.max(groups.length - 1, 0));

    renderKpis(games);
    renderFeatured(games);
    renderToday(games);
    renderTicker(games);
    renderCurrentGroup();

    el.refreshPill.textContent = `Sist oppdatert ${formatTime(new Date())}`;
  } catch (error) {
    console.error(error);
    el.refreshPill.textContent = `Feil ved oppdatering: ${error.message}`;
  } finally {
    hideLoading();
  }
}

async function init() {
  const me = await initProtectedPage();
  if (!me) return;

  await loadDashboard();
  startTimers();
}

window.addEventListener("DOMContentLoaded", init);
window.addEventListener("beforeunload", clearTimers);
