import { initProtectedPage, apiGet } from "./page_auth.js";
import { startInfoscreenRotation } from "./infoscreen_rotation.js";

const REFRESH_MS = 60 * 60 * 1000;
const API_TIMEOUT_MS = 75 * 1000;
const DASHBOARD_CACHE_KEY = "worldcup_infoscreen_payload_v1";
const GROUP_ROTATE_MS = 12 * 1000;
const NORWAY_TIME_ZONE = "Europe/Oslo";
const FALLBACK_STADIUM_TIME_ZONE = "America/Mexico_City";

const STADIUM_TIME_ZONES_BY_ID = {
  "1": "America/Mexico_City",
  "2": "America/Mexico_City",
  "3": "America/Monterrey",
  "4": "America/Chicago",
  "5": "America/Chicago",
  "6": "America/Chicago",
  "7": "America/New_York",
  "8": "America/New_York",
  "9": "America/New_York",
  "10": "America/New_York",
  "11": "America/New_York",
  "12": "America/Toronto",
  "13": "America/Vancouver",
  "14": "America/Los_Angeles",
  "15": "America/Los_Angeles",
  "16": "America/Los_Angeles",
};

const COUNTRY_NAMES_NO = {
  Canada: "Canada",
  Mexico: "Mexico",
  "United States": "USA",
  USA: "USA",
};

const TEAM_NAMES_NO = {
  Algeria: "Algerie",
  Argentina: "Argentina",
  Australia: "Australia",
  Austria: "Østerrike",
  Bahrain: "Bahrain",
  Belgium: "Belgia",
  Bolivia: "Bolivia",
  "Bosnia and Herzegovina": "Bosnia-Hercegovina",
  Brazil: "Brasil",
  Cameroon: "Kamerun",
  Canada: "Canada",
  "Cape Verde": "Kapp Verde",
  Chile: "Chile",
  China: "Kina",
  Colombia: "Colombia",
  Congo: "Kongo",
  "Costa Rica": "Costa Rica",
  Croatia: "Kroatia",
  Curaçao: "Curaçao",
  "Czech Republic": "Tsjekkia",
  Czechia: "Tsjekkia",
  Denmark: "Danmark",
  "DR Congo": "DR Kongo",
  "Congo DR": "DR Kongo",
  "Democratic Republic of Congo": "DR Kongo",
  "Democratic Republic of the Congo": "DR Kongo",
  Ecuador: "Ecuador",
  Egypt: "Egypt",
  England: "England",
  France: "Frankrike",
  Germany: "Tyskland",
  Ghana: "Ghana",
  Greece: "Hellas",
  Haiti: "Haiti",
  Honduras: "Honduras",
  Hungary: "Ungarn",
  Indonesia: "Indonesia",
  Iran: "Iran",
  Iraq: "Irak",
  Ireland: "Irland",
  Italy: "Italia",
  "Ivory Coast": "Elfenbenskysten",
  Jamaica: "Jamaica",
  Japan: "Japan",
  Jordan: "Jordan",
  Kuwait: "Kuwait",
  Lebanon: "Libanon",
  Malaysia: "Malaysia",
  Mali: "Mali",
  Mexico: "Mexico",
  Morocco: "Marokko",
  Netherlands: "Nederland",
  "New Caledonia": "Ny-Caledonia",
  "New Zealand": "New Zealand",
  Nigeria: "Nigeria",
  "North Macedonia": "Nord-Makedonia",
  "Northern Ireland": "Nord-Irland",
  Norway: "Norge",
  Oman: "Oman",
  Panama: "Panama",
  Paraguay: "Paraguay",
  Peru: "Peru",
  Poland: "Polen",
  Portugal: "Portugal",
  Qatar: "Qatar",
  Romania: "Romania",
  "Saudi Arabia": "Saudi-Arabia",
  Scotland: "Skottland",
  Senegal: "Senegal",
  Serbia: "Serbia",
  Slovakia: "Slovakia",
  Slovenia: "Slovenia",
  "South Africa": "Sør-Afrika",
  "South Korea": "Sør-Korea",
  Spain: "Spania",
  Sweden: "Sverige",
  Switzerland: "Sveits",
  Syria: "Syria",
  Tahiti: "Tahiti",
  Thailand: "Thailand",
  "Trinidad and Tobago": "Trinidad og Tobago",
  Tunisia: "Tunisia",
  Turkey: "Tyrkia",
  Ukraine: "Ukraina",
  "United Arab Emirates": "De forente arabiske emirater",
  "United States": "USA",
  Uruguay: "Uruguay",
  USA: "USA",
  Uzbekistan: "Usbekistan",
  Venezuela: "Venezuela",
  Vietnam: "Vietnam",
  Wales: "Wales",
};

const TEAM_FLAGS = {
  Algeria: "🇩🇿",
  Argentina: "🇦🇷",
  Australia: "🇦🇺",
  Austria: "🇦🇹",
  Bahrain: "🇧🇭",
  Belgium: "🇧🇪",
  Bolivia: "🇧🇴",
  "Bosnia and Herzegovina": "🇧🇦",
  Brazil: "🇧🇷",
  Cameroon: "🇨🇲",
  Canada: "🇨🇦",
  "Cape Verde": "🇨🇻",
  Chile: "🇨🇱",
  China: "🇨🇳",
  Colombia: "🇨🇴",
  Congo: "🇨🇬",
  "Costa Rica": "🇨🇷",
  Croatia: "🇭🇷",
  Curaçao: "🇨🇼",
  "Czech Republic": "🇨🇿",
  Czechia: "🇨🇿",
  Denmark: "🇩🇰",
  "DR Congo": "🇨🇩",
  Ecuador: "🇪🇨",
  Egypt: "🇪🇬",
  England: "🏴",
  France: "🇫🇷",
  Germany: "🇩🇪",
  Ghana: "🇬🇭",
  Greece: "🇬🇷",
  Honduras: "🇭🇳",
  Hungary: "🇭🇺",
  Indonesia: "🇮🇩",
  Iran: "🇮🇷",
  Iraq: "🇮🇶",
  Ireland: "🇮🇪",
  Italy: "🇮🇹",
  "Ivory Coast": "🇨🇮",
  Jamaica: "🇯🇲",
  Japan: "🇯🇵",
  Jordan: "🇯🇴",
  Kuwait: "🇰🇼",
  Lebanon: "🇱🇧",
  Malaysia: "🇲🇾",
  Mali: "🇲🇱",
  Mexico: "🇲🇽",
  Morocco: "🇲🇦",
  Netherlands: "🇳🇱",
  "New Caledonia": "🇳🇨",
  "New Zealand": "🇳🇿",
  Nigeria: "🇳🇬",
  "North Macedonia": "🇲🇰",
  "Northern Ireland": "🇬🇧",
  Norway: "🇳🇴",
  Oman: "🇴🇲",
  Panama: "🇵🇦",
  Paraguay: "🇵🇾",
  Peru: "🇵🇪",
  Poland: "🇵🇱",
  Portugal: "🇵🇹",
  Qatar: "🇶🇦",
  Romania: "🇷🇴",
  "Saudi Arabia": "🇸🇦",
  Scotland: "🏴",
  Senegal: "🇸🇳",
  Serbia: "🇷🇸",
  Slovakia: "🇸🇰",
  Slovenia: "🇸🇮",
  "South Africa": "🇿🇦",
  "South Korea": "🇰🇷",
  Spain: "🇪🇸",
  Sweden: "🇸🇪",
  Switzerland: "🇨🇭",
  Syria: "🇸🇾",
  Tahiti: "🇵🇫",
  Thailand: "🇹🇭",
  "Trinidad and Tobago": "🇹🇹",
  Tunisia: "🇹🇳",
  Turkey: "🇹🇷",
  Ukraine: "🇺🇦",
  "United Arab Emirates": "🇦🇪",
  "United States": "🇺🇸",
  Uruguay: "🇺🇾",
  USA: "🇺🇸",
  Uzbekistan: "🇺🇿",
  Venezuela: "🇻🇪",
  Vietnam: "🇻🇳",
  Wales: "🏴",
};

const TEAM_FLAG_CODES = {
  Algeria: "dz",
  Argentina: "ar",
  Australia: "au",
  Austria: "at",
  Bahrain: "bh",
  Belgium: "be",
  Bolivia: "bo",
  "Bosnia and Herzegovina": "ba",
  Brazil: "br",
  Cameroon: "cm",
  Canada: "ca",
  "Cape Verde": "cv",
  Chile: "cl",
  China: "cn",
  Colombia: "co",
  Congo: "cg",
  "Costa Rica": "cr",
  Croatia: "hr",
  "Cura\u00e7ao": "cw",
  "Czech Republic": "cz",
  Czechia: "cz",
  Denmark: "dk",
  "DR Congo": "cd",
  "Congo DR": "cd",
  "Democratic Republic of Congo": "cd",
  "Democratic Republic of the Congo": "cd",
  Ecuador: "ec",
  Egypt: "eg",
  England: "gb-eng",
  France: "fr",
  Germany: "de",
  Ghana: "gh",
  Greece: "gr",
  Haiti: "ht",
  Honduras: "hn",
  Hungary: "hu",
  Indonesia: "id",
  Iran: "ir",
  Iraq: "iq",
  Ireland: "ie",
  Italy: "it",
  "Ivory Coast": "ci",
  Jamaica: "jm",
  Japan: "jp",
  Jordan: "jo",
  Kuwait: "kw",
  Lebanon: "lb",
  Malaysia: "my",
  Mali: "ml",
  Mexico: "mx",
  Morocco: "ma",
  Netherlands: "nl",
  "New Caledonia": "nc",
  "New Zealand": "nz",
  Nigeria: "ng",
  "North Macedonia": "mk",
  "Northern Ireland": "gb-nir",
  Norway: "no",
  Oman: "om",
  Panama: "pa",
  Paraguay: "py",
  Peru: "pe",
  Poland: "pl",
  Portugal: "pt",
  Qatar: "qa",
  Romania: "ro",
  "Saudi Arabia": "sa",
  Scotland: "gb-sct",
  Senegal: "sn",
  Serbia: "rs",
  Slovakia: "sk",
  Slovenia: "si",
  "South Africa": "za",
  "South Korea": "kr",
  Spain: "es",
  Sweden: "se",
  Switzerland: "ch",
  Syria: "sy",
  Tahiti: "pf",
  Thailand: "th",
  "Trinidad and Tobago": "tt",
  Tunisia: "tn",
  Turkey: "tr",
  Ukraine: "ua",
  "United Arab Emirates": "ae",
  "United States": "us",
  Uruguay: "uy",
  USA: "us",
  Uzbekistan: "uz",
  Venezuela: "ve",
  Vietnam: "vn",
  Wales: "gb-wls",
};

const el = {
  clockPill: document.getElementById("clockPill"),
  refreshPill: document.getElementById("refreshPill"),
  statusPill: document.getElementById("statusPill"),
  loadingOverlay: document.getElementById("loadingOverlay"),

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
    infoscreenRotation: null,
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

function apiGetWithTimeout(path, timeoutMs = API_TIMEOUT_MS) {
  let timeoutId = null;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(
      () => reject(new Error("Tidsavbrudd ved henting av VM-data.")),
      timeoutMs
    );
  });

  return Promise.race([apiGet(path), timeout])
    .finally(() => window.clearTimeout(timeoutId));
}

function readDashboardCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(DASHBOARD_CACHE_KEY) || "null");
    if (!cached?.gamesPayload || !cached?.groupsPayload || !cached?.stadiumsPayload) {
      return null;
    }
    return cached;
  } catch {
    return null;
  }
}

function writeDashboardCache(gamesPayload, groupsPayload, stadiumsPayload) {
  try {
    localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify({
      savedAt: new Date().toISOString(),
      gamesPayload,
      groupsPayload,
      stadiumsPayload,
    }));
  } catch {
    // The kiosk can keep running without local cache if storage is unavailable.
  }
}

function normalizeLookupKey(value) {
  return safeText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function mappedValue(map, value) {
  const name = safeText(value);
  if (map[name]) return map[name];

  const lookupKey = normalizeLookupKey(name);
  const matchedKey = Object.keys(map).find(key => normalizeLookupKey(key) === lookupKey);
  return matchedKey ? map[matchedKey] : "";
}

function teamNameNo(value) {
  const name = safeText(value);
  return mappedValue(TEAM_NAMES_NO, name) || name;
}

function teamFlag(value) {
  const name = safeText(value);
  return mappedValue(TEAM_FLAG_CODES, name);
}

function flagImageUrl(flagCode) {
  const code = safeText(flagCode).toLowerCase();
  return code ? `https://flagcdn.com/w40/${encodeURIComponent(code)}.png` : "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function teamLabelHtml(name, flag = "", className = "") {
  const classes = ["team-label", className].filter(Boolean).join(" ");
  const flagUrl = flagImageUrl(flag);
  const flagHtml = flagUrl
    ? `<img class="team-flag" src="${escapeHtml(flagUrl)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.style.display='none';" />`
    : "";

  return `
    <span class="${classes}">
      ${flagHtml}
      <span class="team-label-text">${escapeHtml(name)}</span>
    </span>
  `;
}

function parseBool(value) {
  return String(value ?? "").trim().toLowerCase() === "true";
}

function getDateTimeParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

function getTimeZoneOffsetMs(date, timeZone) {
  const parts = getDateTimeParts(date, timeZone);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  return asUtc - date.getTime();
}

function zonedTimeToDate(parts, timeZone) {
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute
  );
  const firstPass = new Date(utcGuess - getTimeZoneOffsetMs(new Date(utcGuess), timeZone));
  return new Date(utcGuess - getTimeZoneOffsetMs(firstPass, timeZone));
}

function parseGameDate(value, timeZone = FALLBACK_STADIUM_TIME_ZONE) {
  const raw = safeText(value);
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const [, month, day, year, hour, minute] = match;
  return zonedTimeToDate(
    {
      year: Number(year),
      month: Number(month),
      day: Number(day),
      hour: Number(hour),
      minute: Number(minute),
    },
    timeZone
  );
}

function formatDateTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("no-NO", {
    timeZone: NORWAY_TIME_ZONE,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatTime(date = new Date()) {
  return new Intl.DateTimeFormat("no-NO", {
    timeZone: NORWAY_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatClockTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("no-NO", {
    timeZone: NORWAY_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function dateKey(date, timeZone = NORWAY_TIME_ZONE) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const parts = getDateTimeParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function isSameDate(a, b) {
  return !!dateKey(a) && dateKey(a) === dateKey(b);
}

function getGameStatus(game) {
  if (game.finished) return "finished";
  if (game.time_elapsed && game.time_elapsed !== "notstarted") return "live";
  return "upcoming";
}

function getStatusLabel(game) {
  const status = getGameStatus(game);
  if (status === "finished") return "FERDIG";
  if (status === "live") {
    const elapsed = safeText(game.time_elapsed);
    return /^\d+(\+\d+)?$/.test(elapsed) ? `${elapsed}'` : "LIVE";
  }
  return "KOMMER";
}

function parseScorers(value) {
  const raw = safeText(value);
  if (!raw || raw.toLowerCase() === "null" || raw === "{}" || raw === "[]") {
    return [];
  }

  return raw
    .replaceAll("“", '"')
    .replaceAll("”", '"')
    .replaceAll("‘", "'")
    .replaceAll("’", "'")
    .replace(/^[{\[]/, "")
    .replace(/[}\]]$/, "")
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map(item => item.trim().replace(/^["“”�?]+|["“”�?]+$/g, "").trim())
    .filter(Boolean);
}

function scorersHtml(scorers, className) {
  if (!scorers?.length) return "";
  return `
    <div class="${className}">
      ${scorers.map(scorer => `
        <div class="scorer-line">
          <span class="scorer-ball" aria-hidden="true">⚽</span>
          <span>${escapeHtml(scorer)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function matchScorersSummaryHtml(game, className) {
  const parts = [];
  if (game.home_scorers?.length) {
    parts.push(...game.home_scorers.map(scorer => `${game.home_team_name_en}: ${scorer}`));
  }
  if (game.away_scorers?.length) {
    parts.push(...game.away_scorers.map(scorer => `${game.away_team_name_en}: ${scorer}`));
  }

  return scorersHtml(parts, className);
}

function normalizeStadium(row) {
  const id = safeText(row.id);
  return {
    id,
    name: safeText(row.fifa_name || row.name_en),
    originalName: safeText(row.name_en),
    city: safeText(row.city_en),
    country: COUNTRY_NAMES_NO[safeText(row.country_en)] || safeText(row.country_en),
    capacity: toNum(row.capacity),
    region: safeText(row.region),
    timeZone: STADIUM_TIME_ZONES_BY_ID[id] || FALLBACK_STADIUM_TIME_ZONE,
  };
}

function venueText(stadium) {
  if (!stadium) return "";
  const place = [stadium.city, stadium.country].filter(Boolean).join(", ");
  return [stadium.name, place].filter(Boolean).join(" · ");
}

function normalizeGame(row, stadiumsById = new Map()) {
  const stadiumId = safeText(row.stadium_id);
  const stadium = stadiumsById.get(stadiumId) || null;
  const date = parseGameDate(row.local_date, stadium?.timeZone || FALLBACK_STADIUM_TIME_ZONE);
  const homeScore = toNum(row.home_score);
  const awayScore = toNum(row.away_score);
  const homeOriginal = safeText(row.home_team_name_en);
  const awayOriginal = safeText(row.away_team_name_en);
  const homeName = teamNameNo(homeOriginal);
  const awayName = teamNameNo(awayOriginal);

  return {
    ...row,
    id: safeText(row.id),
    group: safeText(row.group),
    matchday: safeText(row.matchday),
    type: safeText(row.type),
    home_team_id: safeText(row.home_team_id),
    away_team_id: safeText(row.away_team_id),
    stadium_id: stadiumId,
    stadium,
    venue: venueText(stadium),
    home_team_name_en: homeName,
    away_team_name_en: awayName,
    home_team_name_original: homeOriginal,
    away_team_name_original: awayOriginal,
    home_flag: teamFlag(homeOriginal),
    away_flag: teamFlag(awayOriginal),
    home_scorers: parseScorers(row.home_scorers),
    away_scorers: parseScorers(row.away_scorers),
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
      map.set(game.home_team_id, {
        name: game.home_team_name_en,
        originalName: game.home_team_name_original,
        flag: game.home_flag,
      });
    }
    if (game.away_team_id && game.away_team_name_en) {
      map.set(game.away_team_id, {
        name: game.away_team_name_en,
        originalName: game.away_team_name_original,
        flag: game.away_flag,
      });
    }
  }
  return map;
}

function groupTeamName(team) {
  return safeText(
    team.name_en ||
    team.team_name_en ||
    team.name ||
    team.team_name ||
    team.country_name ||
    team.country ||
    team.team
  );
}

function normalizeGroups(groups, teamMap) {
  return [...groups]
    .map(group => ({
      name: safeText(group.name),
      teams: (group.teams || [])
        .map(team => {
          const teamId = safeText(team.team_id);
          const teamInfo = teamMap.get(teamId);
          const originalName = teamInfo?.originalName || groupTeamName(team);
          return {
            team_id: teamId,
            name: teamInfo?.name || teamNameNo(originalName) || `Team ${team.team_id}`,
            flag: teamInfo?.flag || teamFlag(originalName),
            mp: toNum(team.mp),
            w: toNum(team.w),
            d: toNum(team.d),
            l: toNum(team.l),
            pts: toNum(team.pts),
            gf: toNum(team.gf),
            ga: toNum(team.ga),
            gd: toNum(team.gd),
          };
        })
        .sort((a, b) =>
          b.pts - a.pts ||
          b.gd - a.gd ||
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

  el.kpiLive.textContent = int(live);
  el.kpiFinished.textContent = int(finished);
  el.kpiGoals.textContent = int(goals);

  el.statusPill.textContent = live ? `${live} LIVE` : "INGEN LIVEKAMPER";
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
    el.featuredTag.textContent = "-";
    el.featuredTag.className = "match-tag";
    el.featuredMeta.innerHTML = "";
    return;
  }

  const status = getGameStatus(game);
  el.featuredTitle.textContent =
    status === "live" ? "Live nå" : status === "finished" ? "Siste resultat" : "Neste kamp";
  el.featuredSub.textContent = `Gruppe ${game.group || "-"} - kampdag ${game.matchday || "-"}`;
  el.featuredTag.className = `match-tag ${status}`;
  el.featuredTag.textContent = getStatusLabel(game);
  el.featuredHome.innerHTML = `
    ${teamLabelHtml(game.home_team_name_en, game.home_flag)}
    ${scorersHtml(game.home_scorers, "featured-scorers")}
  `;
  el.featuredAway.innerHTML = `
    ${teamLabelHtml(game.away_team_name_en, game.away_flag, "team-label-end")}
    ${scorersHtml(game.away_scorers, "featured-scorers")}
  `;
  el.featuredScore.textContent = scoreText(game);
  el.featuredMeta.innerHTML = [
    formatDateTime(game.date),
    game.venue,
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
          <div>${teamLabelHtml(game.home_team_name_en, game.home_flag)}</div>
          <div>${teamLabelHtml(game.away_team_name_en, game.away_flag)}</div>
          ${game.venue ? `<div class="match-venue">${escapeHtml(game.venue)}</div>` : ""}
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
        <div class="ticker-matchup">
          ${teamLabelHtml(game.home_team_name_en, game.home_flag)}
          <span class="team-separator">-</span>
          ${teamLabelHtml(game.away_team_name_en, game.away_flag)}
        </div>
        ${matchScorersSummaryHtml(game, "ticker-scorers")}
        ${game.venue ? `<div class="ticker-venue">${escapeHtml(game.venue)}</div>` : ""}
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
      <colgroup>
        <col class="rank-col">
        <col class="team-col">
        <col class="stat-col">
        <col class="stat-col">
        <col class="stat-col">
        <col class="stat-col">
        <col class="goals-col">
        <col class="stat-col">
        <col class="stat-col">
      </colgroup>
      <thead>
        <tr>
          <th class="rank-head">#</th>
          <th class="team-head">Lag</th>
          <th><span class="metric-head" title="Kamper">K</span></th>
          <th><span class="metric-head" title="Seiere">S</span></th>
          <th><span class="metric-head" title="Uavgjort">U</span></th>
          <th><span class="metric-head" title="Tap">T</span></th>
          <th><span class="metric-head" title="Mål">Mål</span></th>
          <th><span class="metric-head" title="Målforskjell">+/-</span></th>
          <th><span class="metric-head" title="Poeng">P</span></th>
        </tr>
      </thead>
      <tbody>
        ${group.teams.map((team, index) => `
          <tr class="${index === 1 ? "qualification-line" : ""}">
            <td class="rank-cell ${index < 2 ? "qualifies" : ""}">${index + 1}</td>
            <td class="team">${teamLabelHtml(team.name, team.flag)}</td>
            <td>${int(team.mp)}</td>
            <td>${int(team.w)}</td>
            <td>${int(team.d)}</td>
            <td>${int(team.l)}</td>
            <td>${int(team.gf)}-${int(team.ga)}</td>
            <td>${int(team.gd)}</td>
            <td class="points">${int(team.pts)}</td>
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
  state.timers.infoscreenRotation = startInfoscreenRotation();
}

function renderDashboardFromPayloads(gamesPayload, groupsPayload, stadiumsPayload) {
  const stadiumsById = new Map(
    (stadiumsPayload.stadiums || [])
      .map(normalizeStadium)
      .map(stadium => [stadium.id, stadium])
  );
  const games = (gamesPayload.games || [])
    .map(game => normalizeGame(game, stadiumsById))
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
}

async function loadDashboard() {
  showLoading();
  el.refreshPill.textContent = "Oppdaterer data...";

  try {
    const [gamesPayload, groupsPayload, stadiumsPayload] = await Promise.all([
      apiGetWithTimeout("/api/worldcup/games"),
      apiGetWithTimeout("/api/worldcup/groups"),
      apiGetWithTimeout("/api/worldcup/stadiums"),
    ]);

    writeDashboardCache(gamesPayload, groupsPayload, stadiumsPayload);
    renderDashboardFromPayloads(gamesPayload, groupsPayload, stadiumsPayload);

    el.refreshPill.textContent = `Sist oppdatert ${formatTime(new Date())}`;
  } catch (error) {
    console.error(error);
    const cached = readDashboardCache();
    if (cached) {
      renderDashboardFromPayloads(
        cached.gamesPayload,
        cached.groupsPayload,
        cached.stadiumsPayload
      );
      const savedAt = cached.savedAt ? new Date(cached.savedAt) : null;
      const savedLabel = savedAt && !Number.isNaN(savedAt.getTime())
        ? ` fra ${formatTime(savedAt)}`
        : "";
      el.refreshPill.textContent = `API-feil - viser lagret data${savedLabel}`;
    } else {
      el.refreshPill.textContent = state.games.length
        ? "API-feil - beholder viste data"
        : "VM-data er midlertidig utilgjengelig";
    }
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
