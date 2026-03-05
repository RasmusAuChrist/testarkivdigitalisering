import { getToken, clearToken } from "./auth.js";
import { initUserMenu } from "./user_menu.js";

const API_BASE = "https://ask-fastapi-ataza7ake0avfvdy.norwayeast-01.azurewebsites.net";

let lastOrder = null; // { header, steps, events }
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
    const d = new Date(v);
    return d.toLocaleString("no-NO");
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
   Render: Header/Steps/Events
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
    ["På vent (bruker)", header.HoldByUserId ?? ""],

    ["Stoppet (årsak)", header.ClosedReason ?? ""],
    ["Stoppet (kommentar)", header.ClosedComment ?? ""],
    ["Stoppet (steg)", header.ClosedAtOrderStepId ?? ""],
    ["Stoppet (tid)", fmtDate(header.ClosedAtUtc)],
    ["Stoppet (bruker)", header.ClosedByUserId ?? ""],

    ["Opprettet", fmtDate(header.CreatedAt)],
    ["Opprettet av", header.CreatedByUserId ?? ""],
    ["Sist oppdatert", fmtDate(header.UpdatedAt)],
  ];

  grid.innerHTML = fields
    .map(([k, v]) => `
      <div style="border:1px solid #e5e7eb; border-radius:8px; padding:10px;">
        <div style="font-size:12px; color:#6b7280;">${escapeHtml(k)}</div>
        <div style="font-weight:700;">${escapeHtml(v ?? "")}</div>
      </div>
    `)
    .join("");
}

function renderSteps(steps) {
  const body = document.getElementById("stepsBody");
  if (!body) return;

  body.innerHTML = (steps || []).map(s => `
    <tr>
      <td>${escapeHtml(s.Sequence)}</td>
      <td>${escapeHtml(s.StepName)}</td>
      <td>${statusBadge(s.StepStatus)}</td>
      <td>${escapeHtml(s.AssignedToUserId ?? "")}</td>
      <td>${fmtDate(s.StartedAt)}</td>
      <td>${fmtDate(s.CompletedAt)}</td>
      <td>${escapeHtml(s.CompletionDisposition ?? "")}</td>
      <td>${escapeHtml(s.Notes ?? "")}</td>
    </tr>
  `).join("");
}

function renderEvents(events, steps) {
  const stepNameByOrderStepId = new Map();
  for (const s of (steps || [])) stepNameByOrderStepId.set(s.OrderStepId, s.StepName);

  const body = document.getElementById("eventsBody");
  if (!body) return;

  body.innerHTML = (events || []).map(e => `
    <tr>
      <td>${fmtDate(e.CreatedAt)}</td>
      <td>${escapeHtml(e.EventType)}</td>
      <td>${escapeHtml(stepNameByOrderStepId.get(e.OrderStepId) ?? "")}</td>
      <td>${escapeHtml(e.ReasonCode ?? "")}</td>
      <td>${escapeHtml(e.Comment ?? "")}</td>
      <td>${escapeHtml(e.CreatedByUserId ?? "")}</td>
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
  try { return JSON.parse(maybeJson); } catch { return fallback; }
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

function renderDynamicFormInto(hostEl, schemaObj, values, canEdit) {
  const fields = schemaObj?.fields || [];
  if (!fields.length) {
    hostEl.innerHTML = `<div style="color:#6b7280;">Ingen felter definert for dette steget.</div>`;
    return;
  }

  const dis = canEdit ? "" : "disabled";

  hostEl.innerHTML = fields.map(f => {
    const key = escapeHtml(f.key);
    const label = escapeHtml(f.label || f.key);
    const required = !!f.required;

    // Checklist field
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
  const fields = schemaObj?.fields || [];
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

    if (f.type === "checkbox") out[f.key] = !!el.checked;
    else out[f.key] = (el.value ?? "").trim();
  }

  return out;
}

function validateDynamicForm(schemaObj, values) {
  const fields = schemaObj?.fields || [];
  const missing = fields.filter(f => f.required && (
    f.type === "checklist"
      ? !Object.values(values?.[f.key] || {}).some(Boolean)
      : !String(values?.[f.key] ?? "").trim()
  ));
  return missing.map(m => m.label || m.key);
}

function renderPriorStepsInline(items, currentSequence) {
  const host = document.getElementById("priorStepsInlineHost");
  if (!host) return;

  const prior = (items || [])
    .filter(x => Number(x.Sequence) < Number(currentSequence) && x.DataJson);

  if (!prior.length) {
    host.innerHTML = `<div style="color:#6b7280;">Ingen tidligere steg med utfylte detaljer.</div>`;
    return;
  }

  host.innerHTML = prior.map(p => {
    const obj = safeParseJson(p.DataJson, {});
    const entries = Object.entries(obj);

    const commentEntries = entries.filter(([k, v]) =>
      typeof v === "string" &&
      ["merknad", "kommentar", "note", "notat"].some(x => k.toLowerCase().includes(x)) &&
      v.trim() !== ""
    );

    const checklistEntries = entries.filter(([k, v]) => v && typeof v === "object" && !Array.isArray(v) &&
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
      ? `<div style="margin-top:10px; color:#6b7280; font-size:12px;">(Ingen merknad/sjekkliste funnet – viser alle felter)</div>
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

async function renderCurrentStepDetails(order) {
  const card = document.getElementById("stepDetailsCard");
  const sub = document.getElementById("stepDetailsSub");
  const host = document.getElementById("currentStepFormHost");
  const saveBtn = document.getElementById("currentStepSaveBtn");

  // If you haven't added the HTML panel yet, just do nothing.
  if (!card || !sub || !host || !saveBtn) return;

  const step = getCurrentStep(order);
  if (!step) {
    card.style.display = "none";
    return;
  }

  card.style.display = "block";
  sub.textContent = `Aktivt steg: ${step.Sequence} – ${step.StepName} (OrderStepId: ${step.OrderStepId})`;

  const canEdit =
    step.StepStatus === "Active" &&
    lastMe?.user_id != null &&
    String(step.AssignedToUserId) === String(lastMe.user_id);

  saveBtn.style.display = canEdit ? "inline-flex" : "none";

  setCurrentStepMsg("Laster…");

  // Needs StepDefId in the steps payload
  if (!step.StepDefId) {
    host.innerHTML =
      `<div style="color:#b91c1c; font-weight:800;">
         Mangler StepDefId på steget.
       </div>
       <div style="color:#6b7280; margin-top:6px;">
         Legg til <code>os.StepDefId</code> i steps-resultsettet i <code>usp_wf_get_order_by_amid</code>.
       </div>`;
    setCurrentStepMsg("Kan ikke laste skjema.", true);
    return;
  }

  // 1) schema
  const schemaRow = await apiGet(`/api/wf/steps/def/${encodeURIComponent(step.StepDefId)}/form-schema`);
  const schemaObj = safeParseJson(schemaRow.SchemaJson, schemaRow.SchemaJson);

  // 2) current step data
  const dataRow = await apiGet(`/api/wf/steps/${encodeURIComponent(step.OrderStepId)}/form-data`);
  const currentValues = safeParseJson(dataRow.DataJson, {});

  renderDynamicFormInto(host, schemaObj, currentValues, canEdit);

  // 3) previous steps
  const allData = await apiGet(`/api/wf/orders/${encodeURIComponent(order.header.OrderId)}/step-form-data`);
  renderPriorStepsInline(allData.items || [], step.Sequence);

  setCurrentStepMsg(
    canEdit ? "Du kan redigere dette steget." : "Kun aktivt steg tildelt deg kan redigeres.",
    !canEdit
  );

  // Save
  saveBtn.onclick = async () => {
    try {
      const values = readDynamicFormValuesFrom(host, schemaObj);
      const missing = validateDynamicForm(schemaObj, values);
      if (missing.length) {
        setCurrentStepMsg(`Mangler: ${missing.join(", ")}`, true);
        return;
      }

      setCurrentStepMsg("Lagrer…");
      await apiPost(`/api/wf/steps/${encodeURIComponent(step.OrderStepId)}/form-data`, { data: values });
      setCurrentStepMsg("Lagret ✔️");

      // refresh previous steps view
      const allData2 = await apiGet(`/api/wf/orders/${encodeURIComponent(order.header.OrderId)}/step-form-data`);
      renderPriorStepsInline(allData2.items || [], step.Sequence);
    } catch (e) {
      setCurrentStepMsg(e.message || "Feil ved lagring.", true);
    }
  };
}

/* -----------------------------
   WorkNote (localStorage)
------------------------------ */
function workNoteStorageKey(orderHeader) {
  const amid = orderHeader?.ExternalAmid || "unknown";
  return `wf_worknote_${amid}`;
}

function setWorkNoteMsg(text, isError = false) {
  const el = document.getElementById("workNoteMsg");
  if (!el) return;
  el.textContent = text || "";
  el.style.color = isError ? "#b91c1c" : "#6b7280";
}

function getWorkNotePayloadFromUi() {
  return {
    note: document.getElementById("workNoteText")?.value ?? "",
    contact: document.getElementById("workNoteContact")?.value ?? "",
    phone: document.getElementById("workNotePhone")?.value ?? "",
    checklist: {
      dokumentasjon: !!document.getElementById("chk1")?.checked,
      metadata: !!document.getElementById("chk2")?.checked,
      vedlegg: !!document.getElementById("chk3")?.checked,
      fagansvarlig: !!document.getElementById("chk4")?.checked,
      klarNeste: !!document.getElementById("chk5")?.checked,
      avvik: !!document.getElementById("chk6")?.checked,
    },
    updatedAt: new Date().toISOString(),
  };
}

function applyWorkNotePayloadToUi(payload) {
  const t = document.getElementById("workNoteText");
  const c = document.getElementById("workNoteContact");
  const p = document.getElementById("workNotePhone");

  if (t) t.value = payload?.note ?? "";
  if (c) c.value = payload?.contact ?? "";
  if (p) p.value = payload?.phone ?? "";

  const chk = payload?.checklist || {};
  const ids = [
    ["chk1", "dokumentasjon"],
    ["chk2", "metadata"],
    ["chk3", "vedlegg"],
    ["chk4", "fagansvarlig"],
    ["chk5", "klarNeste"],
    ["chk6", "avvik"],
  ];

  for (const [id, key] of ids) {
    const el = document.getElementById(id);
    if (el) el.checked = !!chk[key];
  }
}

function showWorkNoteCard(show) {
  const card = document.getElementById("workNoteCard");
  if (card) card.style.display = show ? "block" : "none";
}

function loadWorkNoteFromStorage(orderHeader) {
  try {
    const key = workNoteStorageKey(orderHeader);
    const raw = localStorage.getItem(key);
    if (!raw) {
      applyWorkNotePayloadToUi(null);
      setWorkNoteMsg("Ingen lagret notat for denne ordren enda.");
      return;
    }
    const payload = JSON.parse(raw);
    applyWorkNotePayloadToUi(payload);
    setWorkNoteMsg(payload?.updatedAt ? `Sist lagret: ${fmtDate(payload.updatedAt)}` : "Lastet.");
  } catch {
    setWorkNoteMsg("Kunne ikke laste notat (ugyldig data i lokal lagring).", true);
  }
}

function saveWorkNoteToStorage(orderHeader) {
  try {
    const key = workNoteStorageKey(orderHeader);
    const payload = getWorkNotePayloadFromUi();
    localStorage.setItem(key, JSON.stringify(payload));
    setWorkNoteMsg(`Lagret lokalt: ${fmtDate(payload.updatedAt)}`);
  } catch {
    setWorkNoteMsg("Kunne ikke lagre notat lokalt.", true);
  }
}

function clearWorkNoteStorage(orderHeader) {
  try {
    const key = workNoteStorageKey(orderHeader);
    localStorage.removeItem(key);
    applyWorkNotePayloadToUi(null);
    setWorkNoteMsg("Tømt.");
  } catch {
    setWorkNoteMsg("Kunne ikke tømme.", true);
  }
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

  // WorkNote
  showWorkNoteCard(true);
  loadWorkNoteFromStorage(data.header);

  // Core render
  renderHeader(data.header);
  renderSteps(data.steps);
  renderEvents(data.events, data.steps);

  // Dynamic current-step form + previous steps panel
  try {
    await renderCurrentStepDetails(data);
  } catch (e) {
    // Don't break the page if dynamic form fails
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

  // dropdown usable before /me loads
  initUserMenu(null);

  if (ensureLoggedIn()) {
    await initMeForMenu();
  }

  // WorkNote buttons
  document.getElementById("workNoteSaveBtn")?.addEventListener("click", () => {
    if (!lastOrder?.header) return;
    saveWorkNoteToStorage(lastOrder.header);
  });

  document.getElementById("workNoteClearBtn")?.addEventListener("click", () => {
    if (!lastOrder?.header) return;
    clearWorkNoteStorage(lastOrder.header);
  });

  // Prevent buttons inside <summary> from toggling <details>
  for (const id of ["workNoteClearBtn", "workNoteSaveBtn"]) {
    document.getElementById(id)?.addEventListener("click", (e) => e.stopPropagation());
  }

  // Load button
  const loadBtn = document.getElementById("loadBtn");
  loadBtn?.addEventListener("click", async () => {
    if (!ensureLoggedIn()) return;
    try {
      await loadOrder();
    } catch (e) {
      setMsg(e.message || "Feil ved henting.", true);
    }
  });

  // Auto-load if amid in querystring (?amid=...)
  const amidFromQs = new URLSearchParams(window.location.search).get("amid");
  if (amidFromQs) {
    const amidInput = document.getElementById("amidInput");
    if (amidInput) amidInput.value = amidFromQs;

    if (ensureLoggedIn()) {
      try { await loadOrder(); } catch { /* already handled */ }
    }
  }
});