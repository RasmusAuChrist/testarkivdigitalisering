import { getToken, clearToken } from "./auth.js";
import { initUserMenu } from "./user_menu.js";

const API_BASE = "https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net";

let lastOrder = null; // { header, steps, events, step_form_data? }
let lastMe = null;    // from /api/auth/me

function setMsg(text, isError = false) {
  const el = document.getElementById("msg");
  if (!el) return;
  el.textContent = text || "";
  el.style.color = isError ? "#ffb4b4" : "#ffffff";
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiGetStep3Form(orderStepId) {
  return apiGet(`/api/wf/steps/${encodeURIComponent(orderStepId)}/step3-form`);
}

async function apiPostStep3Form(orderStepId, body) {
  return apiPost(`/api/wf/steps/${encodeURIComponent(orderStepId)}/step3-form`, body);
}

async function apiGetStepComments(orderStepId) {
  return apiGet(`/api/wf/steps/${encodeURIComponent(orderStepId)}/comments`);
}

async function apiPostStepComment(orderStepId, body) {
  return apiPost(`/api/wf/steps/${encodeURIComponent(orderStepId)}/comments`, body);
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers: { ...authHeaders() } });

  if (res.status === 401) {
    clearToken();
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.assign(`/views/login.html?next=${next}`);
    throw new Error("Ikke innlogget.");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || "Ukjent feil");
  return data;
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    clearToken();
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.assign(`/views/login.html?next=${next}`);
    throw new Error("Ikke innlogget.");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || "Ukjent feil");
  return data;
}

async function apiGetBlob(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { ...authHeaders() },
  });

  if (res.status === 401) {
    clearToken();
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.assign(`/views/login.html?next=${next}`);
    throw new Error("Ikke innlogget.");
  }

  if (!res.ok) {
    let detail = "Ukjent feil";
    try {
      const data = await res.json();
      detail = data?.detail || detail;
    } catch {
      try {
        detail = await res.text();
      } catch {
        // ignore
      }
    }
    throw new Error(detail);
  }

  return await res.blob();
}

async function downloadWorkflowPdf(amid) {
  if (!amid) {
    throw new Error("Fant ikke AMID for denne ordren.");
  }

  const path = `/api/wf/orders/by-amid/${encodeURIComponent(amid)}/report.pdf`;
  const blob = await apiGetBlob(path);

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `workflow-report-${amid}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function updatePdfButtonState() {
  const btn = document.getElementById("downloadPdfBtn");
  if (!btn) return;

  const amid = lastOrder?.header?.ExternalAmid;
  btn.disabled = isDownloadingPdf || !amid;
}

let isDownloadingPdf = false;

function setPdfButtonLoading(isLoading) {
  const btn = document.getElementById("downloadPdfBtn");
  if (!btn) return;

  isDownloadingPdf = isLoading;

  const textEl = btn.querySelector(".btn-text");
  if (textEl) {
    textEl.textContent = isLoading ? "Laster ned PDF…" : "Last ned PDF";
  } else {
    btn.textContent = isLoading ? "Laster ned PDF…" : "Last ned PDF";
  }

  const hasAmid = !!lastOrder?.header?.ExternalAmid;
  btn.disabled = isLoading || !hasAmid;
}

async function initMeForMenu() {
  try {
    const me = await apiGet("/api/auth/me");
    lastMe = me;
    initUserMenu(me);
  } catch {
    // apiGet already redirects on 401
  }
}

async function loadNavbar() {
  const container = document.getElementById("navbar-container");
  if (!container) return;

  try {
    const res = await fetch("/partials/navbar.html");
    container.innerHTML = await res.text();
  } catch {
    try {
      const res = await fetch("/navbar.html");
      container.innerHTML = await res.text();
    } catch {
      container.innerHTML = "";
    }
  }
}

function fmtDate(v) {
  if (!v) return "";

  try {
    let s = String(v).trim();

    // If backend sends SQL-style datetime with space, normalize to ISO-ish
    s = s.replace(" ", "T");

    // If there is no timezone info, treat the value as UTC
    const hasTimezone = /[zZ]$|[+\-]\d{2}:\d{2}$/.test(s);
    if (!hasTimezone) {
      s += "Z";
    }

    const d = new Date(s);

    return d.toLocaleString("no-NO", {
      timeZone: "Europe/Oslo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return String(v);
  }
}

function escapeHtml(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusBadge(status) {
  const color =
    status === "Active" ? "#16a34a" :
    status === "Pending" ? "#ca8a04" :
    status === "Completed" ? "#2563eb" :
    status === "OnHold" || status === "Blocked" ? "#b91c1c" :
    status === "Stopped" ? "#111827" :
    "#374151";

  return `<span style="display:inline-flex; padding:2px 8px; border-radius:999px; background:${color}; color:#fff; font-weight:700; font-size:12px;">${escapeHtml(status)}</span>`;
}

function stringToColor(str) {
  let hash = 0;

  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  const hue = hash % 360;
  return `hsl(${hue}, 65%, 45%)`;
}

function userPill(username, fallback = "") {
  const text = String(username ?? "").trim();
  if (!text) return escapeHtml(fallback);

  const bg = stringToColor(text);

  return `
    <span style="
      display:inline-flex;
      align-items:center;
      padding:4px 10px;
      border-radius:999px;
      font-size:12px;
      font-weight:600;
      background:${bg};
      color:#fff;
      white-space:nowrap;
    ">
      ${escapeHtml(text)}
    </span>
  `;
}

function ensureLoggedIn() {
  const token = getToken();
  if (!token) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.assign(`/views/login.html?next=${next}`);
    return false;
  }
  return true;
}

/* -----------------------------
   Render: Header / Steps / Events
------------------------------ */
function renderHeader(header) {
  const card = document.getElementById("headerCard");
  const grid = document.getElementById("headerGrid");
  if (!card || !grid) return;

  card.style.display = "block";

  const fields = [
    ["OrdreId", header.OrderId],
    ["_amid", header.ExternalAmid],
    ["Batch", header.BatchNo ?? ""],
    ["Tittel", header.Title ?? ""],
    ["Status", header.Status],
    ["Prioritet", header.Priority],
    ["Gjeldende steg-id", header.CurrentOrderStepId ?? ""],

    ["På vent (årsak)", header.HoldReason ?? ""],
    ["På vent (kommentar)", header.HoldComment ?? ""],
    ["På vent (steg)", header.HoldAtOrderStepId ?? ""],
    ["På vent (tid)", fmtDate(header.HoldAtUtc)],

    ["Stoppet (årsak)", header.ClosedReason ?? ""],
    ["Stoppet (kommentar)", header.ClosedComment ?? ""],
    ["Stoppet (steg)", header.ClosedAtOrderStepId ?? ""],
    ["Stoppet (tid)", fmtDate(header.ClosedAtUtc)],

    ["Opprettet", fmtDate(header.CreatedAt)],
    ["Opprettet av", header.CreatedByUserId ?? ""],
    ["Sist oppdatert", fmtDate(header.UpdatedAt)],
  ];

  grid.innerHTML = fields.map(([k, v]) => `
    <div style="border:1px solid #e5e7eb; border-radius:8px; padding:10px;">
      <div style="font-size:12px; color:#6b7280;">${escapeHtml(k)}</div>
      <div style="font-weight:700;">${escapeHtml(v ?? "")}</div>
    </div>
  `).join("");
}

function renderSteps(steps) {
  const body = document.getElementById("stepsBody");
  if (!body) return;

  body.innerHTML = (steps || []).map(s => `
    <tr>
      <td>${escapeHtml(s.Sequence)}</td>
      <td>${escapeHtml(s.StepName)}</td>
      <td>${statusBadge(s.StepStatus)}</td>
      <td>${userPill(s.AssignedToUserName, s.AssignedToUserId ?? "")}</td>      
      <td>${fmtDate(s.StartedAt)}</td>
      <td>${fmtDate(s.CompletedAt)}</td>
      <td>${escapeHtml(s.CompletionDisposition ?? "")}</td>
      <td>${escapeHtml(s.Notes ?? "")}</td>
    </tr>
  `).join("");
}

function renderEvents(events, steps) {
  const stepNameByOrderStepId = new Map();
  for (const s of (steps || [])) {
    stepNameByOrderStepId.set(s.OrderStepId, s.StepName);
  }

  const body = document.getElementById("eventsBody");
  if (!body) return;

  body.innerHTML = (events || []).map(e => `
    <tr>
      <td>${fmtDate(e.CreatedAt)}</td>
      <td>${escapeHtml(e.EventType)}</td>
      <td>${escapeHtml(stepNameByOrderStepId.get(e.OrderStepId) ?? "")}</td>
      <td>${escapeHtml(e.ReasonCode ?? "")}</td>
      <td>${escapeHtml(e.Comment ?? "")}</td>
      <td>${userPill(e.CreatedByUserName, e.CreatedByUserId ?? "")}</td>
    </tr>
  `).join("");
}

/* -----------------------------
   Dynamic current-step form
------------------------------ */
function setCurrentStepMsg(text, isError = false) {
  const el = document.getElementById("currentStepMsg");
  if (!el) return;
  el.textContent = text || "";
  el.style.color = isError ? "#b91c1c" : "#6b7280";
}

function safeParseJson(maybeJson, fallback) {
  if (!maybeJson) return fallback;
  if (typeof maybeJson === "object") return maybeJson;
  try {
    return JSON.parse(maybeJson);
  } catch {
    return fallback;
  }
}

function getCurrentStep(order) {
  const steps = order?.steps || [];
  const currentId = order?.header?.CurrentOrderStepId;

  if (currentId != null) {
    const byId = steps.find(s => String(s.OrderStepId) === String(currentId));
    if (byId) return byId;
  }

  return steps.find(s => s.StepStatus === "Active") || null;
}

function isCommentField(field) {
  const key = String(field?.key || "").toLowerCase();
  const label = String(field?.label || "").toLowerCase();

  return [
    "kommentar",
    "kommentarer",
    "merknad",
    "notat",
    "note",
    "comment",
    "comments",
  ].some(word => key.includes(word) || label.includes(word));
}

function getNonCommentFields(schemaObj) {
  return (schemaObj?.fields || []).filter(f => !isCommentField(f));
}

function getCommentFields(schemaObj) {
  return (schemaObj?.fields || []).filter(f => isCommentField(f));
}

function getRenderableFormFields(schemaObj) {
  return getNonCommentFields(schemaObj);
}

function renderDynamicFormInto(hostEl, schemaObj, values, canEdit) {
  const fields = getRenderableFormFields(schemaObj);
  if (!fields.length) {
    hostEl.innerHTML = `<div style="color:#6b7280;">Ingen felter definert for dette steget.</div>`;
    return;
  }

  const dis = canEdit ? "" : "disabled";

  hostEl.innerHTML = fields.map(f => {
    const key = escapeHtml(f.key);
    const label = escapeHtml(f.label || f.key);
    const required = !!f.required;

    if (f.type === "checklist") {
      const obj = values?.[f.key] || {};
      const items = (f.items || []).map(it => {
        const ik = it.key;
        const il = escapeHtml(it.label || it.key);
        const checked = obj?.[ik] ? "checked" : "";
        return `
          <label style="display:flex; gap:8px; align-items:center; margin:6px 0;">
            <input ${dis} type="checkbox" data-field="${key}" data-subkey="${escapeHtml(ik)}" ${checked} />
            ${il}
          </label>
        `;
      }).join("");

      return `
        <div style="margin-bottom:12px; border:1px solid #e5e7eb; border-radius:10px; padding:10px;">
          <div style="font-weight:800; margin-bottom:6px;">${label}${required ? " *" : ""}</div>
          ${items || `<div style="color:#6b7280;">Ingen sjekkpunkter definert.</div>`}
        </div>
      `;
    }

    const val = values?.[f.key];
    const common = `data-field="${key}" ${required ? "data-required='1'" : ""} ${dis}`;

  if (f.type === "slider") {
    const min = Number(f.min ?? 1);
    const max = Number(f.max ?? 10);
    const step = Number(f.step ?? 1);
    const current = Number(val ?? min);

    return `
      <div style="margin-bottom:12px;">
        <label style="font-weight:800;">${label}${required ? " *" : ""}</label>
        <div style="display:grid; grid-template-columns: 1fr 70px; gap:10px; align-items:center; margin-top:6px;">
          <input
            ${common}
            type="range"
            min="${min}"
            max="${max}"
            step="${step}"
            value="${current}"
            oninput="this.nextElementSibling.value=this.value"
            style="width:100%;"
          />
          <input
            type="number"
            min="${min}"
            max="${max}"
            step="${step}"
            value="${current}"
            ${dis}
            oninput="this.previousElementSibling.value=this.value"
            style="width:70px; height:38px;"
          />
        </div>
      </div>
    `;
  }
    
    if (f.type === "textarea") {
      return `
        <div style="margin-bottom:10px;">
          <label style="font-weight:800;">${label}${required ? " *" : ""}</label><br/>
          <textarea ${common} style="width:100%; min-height:90px;">${escapeHtml(val ?? "")}</textarea>
        </div>
      `;
    }

    if (f.type === "select") {
      const opts = (f.options || []).map(o => {
        const sel = String(o) === String(val) ? "selected" : "";
        return `<option ${sel} value="${escapeHtml(o)}">${escapeHtml(o)}</option>`;
      }).join("");

      return `
        <div style="margin-bottom:10px;">
          <label style="font-weight:800;">${label}${required ? " *" : ""}</label><br/>
          <select ${common} style="width:100%; height:38px;">
            <option value=""></option>
            ${opts}
          </select>
        </div>
      `;
    }

    const inputType =
      f.type === "number" ? "number" :
      f.type === "date" ? "date" :
      f.type === "checkbox" ? "checkbox" :
      "text";

    const checked = inputType === "checkbox" && !!val ? "checked" : "";
    const valueAttr = inputType !== "checkbox" ? `value="${escapeHtml(val ?? "")}"` : "";

    return `
      <div style="margin-bottom:10px;">
        <label style="font-weight:800;">${label}${required ? " *" : ""}</label><br/>
        <input ${common} type="${inputType}" ${valueAttr} ${checked} style="width:100%; height:38px;" />
      </div>
    `;
  }).join("");
}

function readDynamicFormValuesFrom(hostEl, schemaObj) {
  const fields = getRenderableFormFields(schemaObj);
  const out = {};

  for (const f of fields) {
    if (f.type === "checklist") {
      const obj = {};
      const nodes = hostEl.querySelectorAll(`[data-field="${CSS.escape(f.key)}"][data-subkey]`);
      nodes.forEach(n => {
        obj[n.getAttribute("data-subkey")] = !!n.checked;
      });
      out[f.key] = obj;
      continue;
    }

    const el = hostEl.querySelector(`[data-field="${CSS.escape(f.key)}"]`);
    if (!el) continue;

    if (f.type === "checkbox") {
      out[f.key] = !!el.checked;
    } else if (f.type === "number" || f.type === "slider") {
      out[f.key] = el.value === "" ? null : Number(el.value);
    } else {
      out[f.key] = (el.value ?? "").trim();
    }
  }

  return out;
}

function validateDynamicForm(schemaObj, values) {
  const fields = getRenderableFormFields(schemaObj);
  const missing = fields.filter(f => {
    if (!f.required) return false;

    if (f.type === "checklist") {
      return !Object.values(values?.[f.key] || {}).some(Boolean);
    }

    const v = values?.[f.key];
    return v === null || v === undefined || v === "";
  });

  return missing.map(m => m.label || m.key);
}

function renderPriorStepsInline(items, currentSequence) {
  const host = document.getElementById("priorStepsInlineHost");
  if (!host) return;

  const prior = (items || []).filter(x =>
    Number(x.Sequence) < Number(currentSequence) && x.DataJson
  );

  if (!prior.length) {
    host.innerHTML = `<div style="color:#6b7280;">Ingen tidligere steg med utfylte detaljer.</div>`;
    return;
  }

  host.innerHTML = prior.map(p => {
    const obj = safeParseJson(p.DataJson, {});
    const entries = Object.entries(obj);

    const commentEntries = entries.filter(([k, v]) =>
      typeof v === "string" &&
      ["merknad", "kommentar", "kommentarer", "note", "notat"].some(x => k.toLowerCase().includes(x)) &&
      v.trim() !== ""
    );

    const checklistEntries = entries.filter(([k, v]) =>
      v && typeof v === "object" && !Array.isArray(v) &&
      Object.values(v).every(x => typeof x === "boolean")
    );

    const commentHtml = commentEntries.map(([k, v]) => `
      <div style="margin-top:8px;">
        <div style="color:#6b7280; font-size:12px;">${escapeHtml(k)}</div>
        <div style="font-weight:800; white-space:pre-wrap;">${escapeHtml(v)}</div>
      </div>
    `).join("");

    const checklistHtml = checklistEntries.map(([k, v]) => {
      const rows = Object.entries(v).map(([ck, cv]) => `
        <div style="display:flex; gap:8px; align-items:center; padding:4px 0; border-bottom:1px dashed #e5e7eb;">
          <span style="width:18px;">${cv ? "✅" : "⬜"}</span>
          <div style="font-weight:800;">${escapeHtml(ck)}</div>
        </div>
      `).join("");

      return `
        <div style="margin-top:10px; border:1px solid #e5e7eb; border-radius:10px; padding:10px;">
          <div style="font-weight:900; margin-bottom:6px;">${escapeHtml(k)}</div>
          ${rows}
        </div>
      `;
    }).join("");

    const fallbackHtml = (!commentEntries.length && !checklistEntries.length)
      ? `<div style="margin-top:10px; color:#6b7280; font-size:12px;">(Ingen kommentar/sjekkliste funnet – viser alle felter)</div>
         <pre style="background:#f8fafc; border:1px solid #e5e7eb; border-radius:10px; padding:10px; overflow:auto;">${escapeHtml(JSON.stringify(obj, null, 2))}</pre>`
      : "";

    return `
      <details style="border:1px solid #e5e7eb; border-radius:10px; padding:10px; margin-bottom:10px;">
        <summary style="cursor:pointer; font-weight:900;">
          Steg ${escapeHtml(p.Sequence)}: ${escapeHtml(p.StepName)}
          <span style="color:#6b7280; font-weight:700; margin-left:8px;">(${fmtDate(p.UpdatedAtUtc)})</span>
        </summary>
        <div style="margin-top:10px;">
          ${commentHtml}
          ${checklistHtml}
          ${fallbackHtml}
        </div>
      </details>
    `;
  }).join("");
}

function clearCurrentStepHosts() {
  const externalHost = document.getElementById("currentStepExternalHost");
  const formHost = document.getElementById("currentStepFormHost");
  const commentsHost = document.getElementById("stepCommentsHost");

  if (externalHost) externalHost.innerHTML = "";
  if (formHost) formHost.innerHTML = "";
  if (commentsHost) commentsHost.innerHTML = "";
}

function normalizeBoolLike(v) {
  if (v === true || v === false) return v;
  if (v == null) return null;

  const s = String(v).trim().toLowerCase();
  if (["1", "true", "ja", "yes", "checked"].includes(s)) return true;
  if (["0", "false", "nei", "no", "unchecked"].includes(s)) return false;
  return null;
}

function boolIcon(v) {
  const b = normalizeBoolLike(v);
  if (b === true) return "☑";
  if (b === false) return "☐";
  return "•";
}

function renderKeyValueGrid(items) {
  if (!items?.length) {
    return `<div style="color:#6b7280;">Ingen data tilgjengelig.</div>`;
  }

  return `
    <div style="display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap:10px;">
      ${items.map(item => `
        <div style="border:1px solid #e5e7eb; border-radius:8px; padding:10px;">
          <div style="font-size:12px; color:#6b7280;">${escapeHtml(item.label)}</div>
          <div style="font-weight:700; white-space:pre-wrap;">${escapeHtml(item.value ?? "")}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function buildSerieSummaryItems(serie) {
  const pairs = [
    ["Arkiv", serie?.Arkiv_identifikator],
    ["Serie", serie?.serie_identifikator],
    ["Kommentar", serie?.Kommentar],
    ["Sjekkliste", serie?.Sjekkliste],
    ["Valgt status", serie?.ValgtStatusSerie],
    ["Fremdrift", serie?.Progress],
    ["Valgte drivere", serie?.ValgtDrivere],
    ["Valgt vurdering", serie?.ValgtVurdering],
    ["Valgt kvalitet", serie?.ValgtKvalitet],
    ["Score", serie?.Score],
    ["Sist endret av", serie?.EndretAV],
    ["Sist endret", fmtDate(serie?.EndretNår || serie?.LastChanged)],
    ["Fullført", fmtDate(serie?.FullførtNår)],
    ["Godkjent av", serie?.GodkjentAv],
  ];

  return pairs
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([label, value]) => ({ label, value }));
}

function renderChecklistRows(rows) {
  if (!rows?.length) {
    return `<div style="color:#6b7280; padding:10px;">Ingen sjekkpunkter funnet.</div>`;
  }

  return `
    <div style="display:grid; gap:6px;">
      ${rows.map(row => `
        <div style="border:1px solid #e5e7eb; border-radius:8px; padding:10px; display:grid; grid-template-columns: 28px 1fr; gap:10px; align-items:start;">
          <div style="font-size:20px; line-height:1;">${boolIcon(row.checked ?? row.Status)}</div>
          <div>
            <div style="font-weight:700;">${escapeHtml(row.tekst ?? row.EgenskapNavn ?? "")}</div>
            ${row.kommentar || row.Kommentar ? `<div style="margin-top:6px; color:#374151; white-space:pre-wrap;">${escapeHtml(row.kommentar ?? row.Kommentar ?? "")}</div>` : ""}
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderEgenskaperTable(rows) {
  if (!rows?.length) {
    return `<div style="color:#6b7280; padding:10px;">Ingen egenskaper funnet.</div>`;
  }

  return `
    <div style="display:grid; gap:6px;">
      ${rows.map(row => `
        <div style="border:1px solid #e5e7eb; border-radius:8px; padding:10px; display:grid; grid-template-columns: 28px 1fr; gap:10px; align-items:start;">
          <div style="font-size:20px; line-height:1;">${boolIcon(row.status ?? row.Status)}</div>
          <div>
            <div style="font-weight:700;">${escapeHtml(row.navn ?? row.EgenskapNavn ?? "")}</div>
            ${row.kommentar || row.Kommentar ? `<div style="margin-top:6px; color:#374151; white-space:pre-wrap;">${escapeHtml(row.kommentar ?? row.Kommentar ?? "")}</div>` : ""}
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderStep3ExternalData(externalData) {
  const host = document.getElementById("currentStepExternalHost");
  if (!host) return;

  const serie = externalData?.serie || {};
  const metadata = externalData?.metadata || [];
  const sjekkliste = externalData?.sjekkliste || [];
  const egenskaper = externalData?.egenskaper || [];

  const tabsId = `exttabs_${Math.random().toString(36).slice(2, 8)}`;

  host.innerHTML = `
    <div style="display:grid; gap:12px;">
      <div style="border:1px solid #e5e7eb; border-radius:10px; padding:12px;">
        <div style="font-weight:900; margin-bottom:10px;">Seriedata</div>
        ${renderKeyValueGrid(buildSerieSummaryItems(serie))}
      </div>

      <div style="border:1px solid #e5e7eb; border-radius:10px; padding:12px;">
        <div style="font-weight:900; margin-bottom:10px;">Metadata</div>
        ${renderKeyValueGrid(metadata)}
      </div>

      <div style="border:1px solid #e5e7eb; border-radius:10px; overflow:hidden;">
        <div style="display:flex; gap:8px; padding:10px 12px; background:#f8fafc; border-bottom:1px solid #e5e7eb;">
          <button type="button" class="btn btn-outline" data-tab-group="${tabsId}" data-tab-target="sjekkliste">Sjekkliste</button>
          <button type="button" class="btn btn-outline" data-tab-group="${tabsId}" data-tab-target="egenskaper">Egenskaper</button>
        </div>

        <div data-tab-panel-group="${tabsId}">
          <div data-tab-panel="sjekkliste" style="padding:12px;">
            ${renderChecklistRows(sjekkliste)}
          </div>
          <div data-tab-panel="egenskaper" style="padding:12px; display:none;">
            ${renderEgenskaperTable(egenskaper)}
          </div>
        </div>
      </div>
    </div>
  `;

  const tabButtons = host.querySelectorAll(`[data-tab-group="${tabsId}"]`);
  const tabPanels = host.querySelectorAll(`[data-tab-panel-group="${tabsId}"] [data-tab-panel]`);

  function activateTab(target) {
    tabPanels.forEach(panel => {
      panel.style.display = panel.getAttribute("data-tab-panel") === target ? "block" : "none";
    });
    tabButtons.forEach(btn => {
      const active = btn.getAttribute("data-tab-target") === target;
      btn.style.background = active ? "#475569" : "";
      btn.style.color = active ? "#fff" : "";
      btn.style.borderColor = active ? "#475569" : "";
    });
  }

  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => activateTab(btn.getAttribute("data-tab-target")));
  });

  activateTab("sjekkliste");
}

function renderStatusCommentListRows(items, groupKey, values, canEdit, isEditMode) {
  const editable = canEdit && isEditMode;

  if (!items?.length) {
    return `<div style="color:#6b7280; padding:10px;">Ingen elementer funnet.</div>`;
  }

  return `
    <div>
      ${items.map(item => {
        const itemKey = String(item.key);
        const current = values?.[itemKey] || {};
        const isChecked = current.status === true;
        const comment = (current.kommentar || "").trim();
        const hasComment = comment.length > 0;

        const checked = isChecked ? "checked" : "";
        const disabled = editable ? "" : "disabled";

        const rowClasses = [
          "step3-row",
          editable ? "is-editable" : "",
          isChecked ? "is-checked" : ""
        ].filter(Boolean).join(" ");

        let commentHtml = "";

        if (editable) {
          commentHtml = `
            <div class="step3-comment-block">
              <div class="step3-comment-label">Kommentar</div>
              <textarea
                class="step3-comment-input"
                data-step3-group="${escapeHtml(groupKey)}"
                data-step3-key="${escapeHtml(itemKey)}"
                data-step3-role="kommentar"
                ${disabled}
                placeholder="Kort kommentar ved behov"
              >${escapeHtml(current.kommentar || "")}</textarea>
            </div>
          `;
        } else if (hasComment) {
          commentHtml = `
            <div class="step3-comment-block">
              <div class="step3-comment-label">Kommentar</div>
              <div class="step3-comment-readonly">${escapeHtml(comment)}</div>
            </div>
          `;
        } else {
          commentHtml = ``;
        }

        return `
          <div class="${rowClasses}">
            <div class="step3-head">
            <label class="step3-check-wrap">
              <input
                class="step3-check"
                type="checkbox"
                data-step3-group="${escapeHtml(groupKey)}"
                data-step3-key="${escapeHtml(itemKey)}"
                data-step3-role="status"
                ${checked}
                ${disabled}
              />
              <span class="step3-check-visual">✓</span>
            </label>
              <div class="step3-title">${escapeHtml(item.label || item.key)}</div>
            </div>

            ${commentHtml}
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderStep3FormInto(hostEl, payload, canEdit, isEditMode) {
  const schema = payload?.schema || {};
  const data = payload?.data || {};
  const fields = schema?.fields || [];

  const sjekklisteField = fields.find(f => f.key === "sjekkliste");
  const egenskaperField = fields.find(f => f.key === "egenskaper");

  const toggleId = `step3EditToggle_${Math.random().toString(36).slice(2, 8)}`;
  const toggleClass = canEdit ? "step3-toggle" : "step3-toggle is-disabled";
  const toggleChecked = isEditMode ? "checked" : "";
  const toggleDisabled = canEdit ? "" : "disabled";

  hostEl.innerHTML = `
    <div style="display:grid; gap:12px;">
      <div style="border:1px solid #e5e7eb; border-radius:10px; padding:12px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px; flex-wrap:wrap;">
          <div style="font-weight:900;">Sjekkliste</div>
        </div>

        ${renderStatusCommentListRows(
          sjekklisteField?.items || [],
          "sjekkliste",
          data?.sjekkliste || {},
          canEdit,
          isEditMode
        )}
      </div>

      <div style="border:1px solid #e5e7eb; border-radius:10px; padding:12px;">
        <div style="font-weight:900; margin-bottom:10px;">Egenskaper</div>
        ${renderStatusCommentListRows(
          egenskaperField?.items || [],
          "egenskaper",
          data?.egenskaper || {},
          canEdit,
          isEditMode
        )}
      </div>
    </div>
  `;
}

function readStep3FormValuesFrom(hostEl, originalPayload) {
  const out = {
    external: { ...(originalPayload?.data?.external || {}) },
    sjekkliste: {},
    egenskaper: {},
  };

  const nodes = hostEl.querySelectorAll("[data-step3-group][data-step3-key][data-step3-role]");

  const touched = new Map();

  nodes.forEach(node => {
    const group = node.getAttribute("data-step3-group");
    const key = node.getAttribute("data-step3-key");
    const role = node.getAttribute("data-step3-role");

    if (!touched.has(`${group}:${key}`)) {
      touched.set(`${group}:${key}`, { group, key });
    }

    if (!out[group][key]) {
      out[group][key] = { status: false, kommentar: "" };
    }

    if (role === "status") {
      out[group][key].status = !!node.checked;
    } else if (role === "kommentar") {
      out[group][key].kommentar = (node.value || "").trim();
    }
  });

  return out;
}

function renderStepCommentFieldInto(hostEl, field, values, canEdit) {
  if (!field) {
    hostEl.innerHTML = "";
    return;
  }

  const key = escapeHtml(field.key);
  const label = escapeHtml(field.label || field.key);
  const required = !!field.required;
  const val = values?.[field.key] ?? "";
  const dis = canEdit ? "" : "disabled";

  hostEl.innerHTML = `
    <div style="border:1px solid #e5e7eb; border-radius:10px; padding:12px; background:#fff; margin-top:12px;">
      <div style="font-weight:900; margin-bottom:8px;">Stegkommentar</div>
      <div style="margin-bottom:10px;">
        <label style="font-weight:800;">${label}${required ? " *" : ""}</label><br/>
        <textarea
          data-field="${key}"
          ${required ? "data-required='1'" : ""}
          ${dis}
          style="width:100%; min-height:90px;"
        >${escapeHtml(val)}</textarea>
      </div>
    </div>
  `;
}

async function renderCurrentStepDetails(order) {
  const card = document.getElementById("stepDetailsCard");
  const sub = document.getElementById("stepDetailsSub");
  const externalHost = document.getElementById("currentStepExternalHost");
  const formHost = document.getElementById("currentStepFormHost");
  const commentsHost = document.getElementById("stepCommentsHost");
  const saveBtn = document.getElementById("currentStepSaveBtn");

  if (!card || !sub || !formHost || !saveBtn) return;

  const step = getCurrentStep(order);
  if (!step) {
    card.style.display = "none";
    return;
  }

  card.style.display = "block";
  clearCurrentStepHosts();

  sub.textContent = `Aktivt steg: ${step.Sequence} – ${step.StepName} (OrderStepId: ${step.OrderStepId})`;

  const canEdit =
    step.StepStatus === "Active" &&
    lastMe?.user_id != null &&
    String(step.AssignedToUserId) === String(lastMe.user_id);

  setCurrentStepMsg("Laster…");

  if (!step.StepDefId) {
    formHost.innerHTML = `
      <div style="color:#b91c1c; font-weight:800;">Mangler StepDefId på steget.</div>
      <div style="color:#6b7280; margin-top:6px;">
        Legg til <code>os.StepDefId</code> i steps-resultsettet i <code>usp_wf_get_order_by_amid</code>.
      </div>
    `;
    saveBtn.style.display = "none";
    setCurrentStepMsg("Kan ikke laste skjema.", true);
    return;
  }

  const schemaRow = await apiGet(`/api/wf/steps/def/${encodeURIComponent(step.StepDefId)}/form-schema`);
  const schemaObj = safeParseJson(schemaRow.SchemaJson, schemaRow.SchemaJson);

  const editToggleWrap = document.getElementById("currentStepEditToggleWrap");
  const editToggle = document.getElementById("currentStepEditToggle");

  if (editToggleWrap) editToggleWrap.style.display = "none";
  if (editToggle) {
    editToggle.checked = false;
    editToggle.disabled = true;
  }

  // STEP 3 / external form with read-only default + toggle to edit
  const isStep3External =
    schemaObj?.source === "external" &&
    (schemaObj?.editor === "step3" || schemaObj?.layout === "step3_external");

  if (isStep3External) {
    const step3Payload = await apiGetStep3Form(step.OrderStepId);

    let isEditMode = false;

    const rerenderStep3 = () => {
      renderStep3FormInto(formHost, step3Payload, canEdit, isEditMode);

      if (saveBtn) {
        saveBtn.style.display = canEdit && isEditMode ? "inline-flex" : "none";
      }

      setCurrentStepMsg(
        canEdit
          ? (isEditMode ? "Redigeringsmodus er aktiv." : "Visningsmodus. Slå på Rediger for å gjøre endringer.")
          : "Kun aktivt steg tildelt deg kan redigeres.",
        false
      );
    };

    if (externalHost) externalHost.innerHTML = "";

   // const bindStep3Toggle = () => {
   //   const toggle = formHost.querySelector("[data-step3-edit-toggle='1']");
   //   if (!toggle) return;

   //   toggle.addEventListener("change", () => {
   //     isEditMode = !!toggle.checked;
   //     renderAndBindStep3();
   //   });
   // };

    const renderAndBindStep3 = () => {
      rerenderStep3();
      bindStep3Toggle();
    };

    renderAndBindStep3();

    const allData = await apiGet(`/api/wf/orders/${encodeURIComponent(order.header.OrderId)}/step-form-data`);
    renderPriorStepsInline(allData.items || [], step.Sequence);

    saveBtn.onclick = async () => {
  try {
    const values = {};

    const nonCommentFields = getNonCommentFields(schemaObj);
    const commentFields = getCommentFields(schemaObj);
    const primaryCommentField = commentFields[0] || null;

    if (nonCommentFields.length) {
      Object.assign(
        values,
        readDynamicFormValuesFrom(formHost, { fields: nonCommentFields })
      );
    }

    if (primaryCommentField) {
      Object.assign(
        values,
        readDynamicFormValuesFrom(formHost, { fields: [primaryCommentField] })
      );
    }

    const missing = [
      ...validateDynamicForm({ fields: nonCommentFields }, values),
      ...validateDynamicForm({ fields: primaryCommentField ? [primaryCommentField] : [] }, values),
    ];

    if (missing.length) {
      setCurrentStepMsg(`Mangler: ${missing.join(", ")}`, true);
      return;
    }

    setCurrentStepMsg("Lagrer…");
    await apiPost(`/api/wf/steps/${encodeURIComponent(step.OrderStepId)}/form-data`, { data: values });
    setCurrentStepMsg("Lagret ✔️");

    const allData2 = await apiGet(`/api/wf/orders/${encodeURIComponent(order.header.OrderId)}/step-form-data`);
    renderPriorStepsInline(allData2.items || [], step.Sequence);
  } catch (e) {
    setCurrentStepMsg(e.message || "Feil ved lagring.", true);
  }
};

    return;
  }
  // Normal editable workflow form
  saveBtn.style.display = canEdit ? "inline-flex" : "none";

const dataRow = await apiGet(`/api/wf/steps/${encodeURIComponent(step.OrderStepId)}/form-data`);
const currentValues = safeParseJson(dataRow.DataJson, {});

const nonCommentFields = getNonCommentFields(schemaObj);
const commentFields = getCommentFields(schemaObj);
const primaryCommentField = commentFields[0] || null;

formHost.innerHTML = "";

if (nonCommentFields.length) {
  const normalHost = document.createElement("div");
  formHost.appendChild(normalHost);

  renderDynamicFormInto(
    normalHost,
    { ...schemaObj, fields: nonCommentFields },
    currentValues,
    canEdit
  );
}

if (primaryCommentField) {
  const stepCommentHost = document.createElement("div");
  formHost.appendChild(stepCommentHost);

  renderStepCommentFieldInto(
    stepCommentHost,
    primaryCommentField,
    currentValues,
    canEdit
  );
}

if (!nonCommentFields.length && !primaryCommentField) {
  formHost.innerHTML = `<div style="color:#6b7280;">Ingen felter definert for dette steget.</div>`;
}

  if (commentsHost) {
  const commentsPayload = await apiGetStepComments(step.OrderStepId);
  const commentItems = commentsPayload.items || [];
  const commentCount = commentItems.length;

  const commentListHtml = commentItems.length
    ? commentItems.map(c => `
        <div style="border:1px solid #e5e7eb; border-radius:10px; padding:10px; margin-bottom:8px; background:#fff;">
          <div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap;">
            <div style="font-weight:800;">
              Steg ${escapeHtml(c.Sequence)} · ${escapeHtml(c.CreatedByUserName || c.CreatedByUserId || "")}
            </div>
            <div style="font-size:12px; color:#6b7280;">
              ${fmtDate(c.CreatedAtUtc)}
            </div>
          </div>
          <div style="margin-top:6px; white-space:pre-wrap;">
            ${escapeHtml(c.CommentText || "")}
          </div>
        </div>
      `).join("")
    : `<div style="color:#6b7280;">Ingen kommentarer ennå.</div>`;

  commentsHost.innerHTML = `
    <details open style="border:1px solid #e5e7eb; border-radius:10px; background:#fff;">
      <summary style="list-style:none; cursor:pointer; padding:12px; display:flex; align-items:center; justify-content:space-between;">
        <div>
          <div style="font-weight:900;">Samtalekommentarer (${commentCount})</div>
          <div style="font-size:12px; color:#6b7280; margin-top:4px;">
            Tidligere kommentarer er låst og kan ikke redigeres.
          </div>
        </div>
        <span aria-hidden="true" style="font-weight:900;">▾</span>
      </summary>

      <div style="padding:0 12px 12px 12px;">
        <div style="margin-bottom:12px;">
          ${commentListHtml}
        </div>

        <div style="border-top:1px solid #e5e7eb; padding-top:12px;">
          <div style="font-weight:800; margin-bottom:6px;">Ny kommentar</div>
          <textarea
            id="stepCommentText"
            style="width:100%; min-height:80px;"
            placeholder="Skriv ny kommentar her..."
            ${canEdit ? "" : "disabled"}
          ></textarea>

          <div style="display:flex; gap:10px; align-items:center; margin-top:8px; flex-wrap:wrap;">
            <button
              id="stepCommentBtn"
              class="btn btn-primary"
              type="button"
              ${canEdit ? "" : "disabled"}
            >
              Legg til kommentar
            </button>
            <div id="stepCommentMsg" style="font-size:12px; color:#6b7280;">
              ${canEdit ? "" : "Kun aktivt steg tildelt deg kan kommenteres."}
            </div>
          </div>
        </div>
      </div>
    </details>
  `;

  const btn = document.getElementById("stepCommentBtn");
  const msgEl = document.getElementById("stepCommentMsg");

  btn?.addEventListener("click", async () => {
    const text = document.getElementById("stepCommentText")?.value?.trim() || "";
    if (!text) {
      if (msgEl) {
        msgEl.textContent = "Skriv en kommentar først.";
        msgEl.style.color = "#b91c1c";
      }
      return;
    }

    try {
      if (msgEl) {
        msgEl.textContent = "Lagrer kommentar…";
        msgEl.style.color = "#6b7280";
      }

      await apiPostStepComment(step.OrderStepId, { text });
      await renderCurrentStepDetails(order);

      if (msgEl) {
        msgEl.textContent = "Kommentar lagret ✔️";
        msgEl.style.color = "#6b7280";
      }
    } catch (e) {
      if (msgEl) {
        msgEl.textContent = e.message || "Feil ved lagring av kommentar.";
        msgEl.style.color = "#b91c1c";
      }
    }
  });
}

setCurrentStepMsg(
  canEdit ? "Du kan redigere dette steget." : "Kun aktivt steg tildelt deg kan redigeres.",
  !canEdit
);
}

/* -----------------------------
   Load order
------------------------------ */
async function loadOrder() {
  const amidEl = document.getElementById("amidInput");
  const amid = amidEl?.value?.trim();
  if (!amid) {
    setMsg("Skriv inn _amid for å hente ordre.", true);
    return null;
  }

  setMsg("Henter…");
  const data = await apiGet(`/api/wf/orders/by-amid/${encodeURIComponent(amid)}`);
  lastOrder = data;
  updatePdfButtonState();

  // Hide old local-only notes block
  const workNoteCard = document.getElementById("workNoteCard");
  if (workNoteCard) workNoteCard.style.display = "none";

  renderHeader(data.header);
  renderSteps(data.steps);
  renderEvents(data.events, data.steps);

  try {
    await renderCurrentStepDetails(data);
  } catch (e) {
    setCurrentStepMsg(e.message || "Feil ved lasting av stegdetaljer.", true);
  }

  setMsg("OK");
  return data;
}

/* -----------------------------
   DOM ready
------------------------------ */
document.addEventListener("DOMContentLoaded", async () => {
  await loadNavbar();

  initUserMenu(null);
  updatePdfButtonState();

  if (ensureLoggedIn()) {
    await initMeForMenu();
  }

  const loadBtn = document.getElementById("loadBtn");
  loadBtn?.addEventListener("click", async () => {
    if (!ensureLoggedIn()) return;
    try {
      await loadOrder();
    } catch (e) {
      setMsg(e.message || "Feil ved henting.", true);
    }
  });

  const downloadPdfBtn = document.getElementById("downloadPdfBtn");
    downloadPdfBtn?.addEventListener("click", async () => {
      if (!ensureLoggedIn()) return;
      if (isDownloadingPdf) return;

      try {
        const amid = lastOrder?.header?.ExternalAmid || document.getElementById("amidInput")?.value?.trim();
        if (!amid) {
          setMsg("Fant ikke AMID for denne ordren.", true);
          return;
        }

        setPdfButtonLoading(true);
        setMsg("Genererer PDF…");

        await downloadWorkflowPdf(amid);

        setMsg("PDF lastet ned.");
      } catch (e) {
        setMsg(e.message || "Feil ved nedlasting av PDF.", true);
      } finally {
        setPdfButtonLoading(false);
      }
    });

  const amidFromQs = new URLSearchParams(window.location.search).get("amid");
  if (amidFromQs) {
    const amidInput = document.getElementById("amidInput");
    if (amidInput) amidInput.value = amidFromQs;

    if (ensureLoggedIn()) {
      try {
        await loadOrder();
      } catch {
        // already handled
      }
    }
  }
});