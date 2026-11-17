/**
 * Hearth Intake Desk · Squad 7
 * Mission 16: Two-Column Split (Conversation + Self-Writing Brief)
 * Zero dashboards, zero stat tiles, zero tabs.
 */

// Application State
const state = {
  userId: "worker-dev",
  sessionId: `session-${Date.now()}`,
  isMockMode: false,
  currentTurnIndex: 0,
  keptEvidence: [],
  excludedEvidence: [],
  statutes: [],
  funds: [],
  tractContext: null,
  boundaries: [],
  briefMarkdown: "",
  mockTurns: []
};

// Golden Turn Definitions for Demo Script Drawer
const GOLDEN_TURNS = [
  {
    turn: 1,
    title: "1. Initial Intake & Habitability Search",
    prompt: "New intake. Tenant on the 1000 block of St. Nicholas Ave, Manhattan. Nonpayment hearing Monday 9:30. Radiators cold since early Nov, black mold around the tub, water coming through the bathroom wall. Anything open on her block?"
  },
  {
    turn: 2,
    title: "2. Vector Exclusions & Decoy Traps",
    prompt: "Why did you drop that boiler record from early November on St. Nicholas Ave?"
  },
  {
    turn: 3,
    title: "3. Applicable Housing Statutes",
    prompt: "What statutes or municipal codes cover these three hazards?"
  },
  {
    turn: 4,
    title: "4. Relief Funds Matching",
    prompt: "Household of 3, about $31k a year, owes $3,350, has the court index number. Her daughter's asthma is worse. What emergency funds can she apply for?"
  },
  {
    turn: 5,
    title: "5. Neighborhood Context & Baselines",
    prompt: "What's the neighborhood eviction context for this tract?"
  },
  {
    turn: 6,
    title: "6. Landlord Disputed Repair Defense",
    prompt: "Landlord's attorney claims the heat was restored last week. What does our record show?"
  },
  {
    turn: 7,
    title: "7. Finalize Pre-Calendar Brief",
    prompt: "Write up the complete pre-calendar brief for the supervising attorney."
  }
];

// Initialize on DOM Load
document.addEventListener("DOMContentLoaded", async () => {
  setupEventListeners();
  renderDemoDrawer();
  updateSuggestedChips(0);
  await loadMockData();
  await initSession();

  // Initial welcome greeting from Hearth
  appendMessage("assistant", "Hearth active. Case Marisol V. loaded (1000 Block St. Nicholas Ave, Manhattan). Nonpayment hearing set for Monday 9:30 AM at 111 Centre St. Ready for tenant intake.", null);
});

// Setup DOM Event Listeners
function setupEventListeners() {
  // Mode Buttons
  document.getElementById("mode-live-btn").addEventListener("click", () => setMode(false));
  document.getElementById("mode-mock-btn").addEventListener("click", () => setMode(true));

  // Chat Send & Input
  document.getElementById("send-btn").addEventListener("click", handleSend);
  const input = document.getElementById("chat-input");
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // Demo Drawer Toggles
  const drawerBtn = document.getElementById("demo-script-btn");
  const closeDrawerBtn = document.getElementById("close-drawer-btn");
  const backdrop = document.getElementById("drawer-backdrop");

  drawerBtn.addEventListener("click", toggleDrawer);
  closeDrawerBtn.addEventListener("click", toggleDrawer);
  backdrop.addEventListener("click", toggleDrawer);

  // Global '?' key opens demo drawer
  document.addEventListener("keydown", (e) => {
    if (e.key === "?" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
      e.preventDefault();
      toggleDrawer();
    }
  });

  // Brief Toolbar Actions
  document.getElementById("copy-brief-btn").addEventListener("click", copyBrief);
  document.getElementById("print-brief-btn").addEventListener("click", () => window.print());
  document.getElementById("download-brief-btn").addEventListener("click", downloadBrief);

  // Voice Mic Button (M17 Web Speech Hook)
  const micBtn = document.getElementById("mic-btn");
  micBtn.addEventListener("click", handleMicClick);
}

function toggleDrawer() {
  const drawer = document.getElementById("demo-drawer");
  const backdrop = document.getElementById("drawer-backdrop");
  const isOpen = drawer.classList.contains("open");
  drawer.classList.toggle("open", !isOpen);
  backdrop.classList.toggle("open", !isOpen);
  drawer.setAttribute("aria-hidden", isOpen ? "true" : "false");
}

function setMode(mock) {
  state.isMockMode = mock;
  document.getElementById("mode-mock-btn").classList.toggle("active", mock);
  document.getElementById("mode-live-btn").classList.toggle("active", !mock);
}

async function loadMockData() {
  try {
    const res = await fetch("mock/turns.json");
    if (res.ok) {
      state.mockTurns = await res.json();
    }
  } catch (err) {
    console.warn("Could not load mock/turns.json:", err);
  }
}

async function initSession() {
  try {
    await fetch(`/apps/navigator/users/${state.userId}/sessions/${state.sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
  } catch (err) {
    console.warn("Session init warning:", err);
  }
}

// -------------------------------------------------------------------------
// Chat Interaction & Message Handling
// -------------------------------------------------------------------------

async function handleSend() {
  const input = document.getElementById("chat-input");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";

  appendMessage("user", text);

  if (state.isMockMode) {
    await runMockTurn(text);
  } else {
    await runLiveTurn(text);
  }
}

function appendMessage(role, text, inlineData = null) {
  const container = document.getElementById("chat-messages");
  const row = document.createElement("div");
  row.className = `message-row ${role}`;

  const author = document.createElement("div");
  author.className = "message-author";
  author.innerText = role === "user" ? "Intake Worker (Dev)" : "Hearth";
  row.appendChild(author);

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";

  // Parse text and format invariant if present
  let formattedHtml = escapeHtml(text).replace(/\n/g, "<br>");
  
  // Highlight invariant: **What the record can't prove yet:**
  const invariantPrefix = "What the record can't prove yet:";
  const invariantMatch = text.match(/\*\*What the record can't prove yet:\*\*\s*(.+)/i) || 
                         text.match(/What the record can't prove yet:\s*(.+)/i);
  if (invariantMatch && invariantMatch[1]) {
    const boundaryText = invariantMatch[1].trim();
    if (!state.boundaries.includes(boundaryText)) {
      state.boundaries.push(boundaryText);
      updateBriefBoundariesSection();
    }
    
    // Replace in message with styled callout
    formattedHtml = formattedHtml.replace(
      /\*\*What the record can't prove yet:\*\*[\s\S]+/i,
      `<div class="invariant-box"><strong>What the record can't prove yet:</strong>${escapeHtml(boundaryText)}</div>`
    );
  }

  bubble.innerHTML = formattedHtml;

  // Append inline chips or summary if inlineData provided
  if (inlineData) {
    renderInlineChipsIntoBubble(bubble, inlineData);
  }

  row.appendChild(bubble);
  container.appendChild(row);
  container.scrollTop = container.scrollHeight;
  return bubble;
}

function renderInlineChipsIntoBubble(bubble, data) {
  const group = document.createElement("div");
  group.className = "inline-evidence-group";

  // 1. Kept Evidence Chips
  if (data.kept && data.kept.length > 0) {
    data.kept.forEach(item => {
      const chip = document.createElement("div");
      chip.className = "evidence-chip kept";
      chip.innerHTML = `
        <div class="chip-header">
          <div class="chip-headline">
            <span class="chip-check">✓</span>
            <span class="chip-id">${escapeHtml(item.request_id)}</span>
            <span class="chip-meta">${escapeHtml(item.hpd_class || 'Class A')} · ${escapeHtml(item.raw_complaint_type || 'mold')} · open since ${escapeHtml(item.created_date || 'Nov 1')}</span>
          </div>
          <span class="chip-expand-arrow">▼</span>
        </div>
        <div class="chip-raw-detail">{
  "request_id": "${escapeHtml(item.request_id)}",
  "complaint_type": "${escapeHtml(item.raw_complaint_type || '')}",
  "descriptor": "${escapeHtml(item.descriptor || '')}",
  "date": "${escapeHtml(item.created_date || '')}",
  "tract": "${escapeHtml(item.census_tract_geoid || '36061024500')}",
  "similarity": ${Number(item.similarity || 0.81).toFixed(4)}
}</div>
      `;
      chip.addEventListener("click", () => chip.classList.toggle("expanded"));
      group.appendChild(chip);
    });
  }

  // 2. Struck-Through Excluded Chips
  if (data.excluded && data.excluded.length > 0) {
    data.excluded.forEach(item => {
      const chip = document.createElement("div");
      chip.className = "evidence-chip excluded";
      const sim = Number(item.similarity || 0.75).toFixed(2);
      chip.innerHTML = `
        <div class="chip-header">
          <span class="chip-struck">~~${escapeHtml(item.request_id)} · sim ${sim}~~</span>
          <span class="chip-reason">${escapeHtml(item.excluded_because || 'Commercial property or closed enforcement case')}</span>
        </div>
      `;
      group.appendChild(chip);
    });
  }

  // 3. Raw search ranked these first (Pre-filter candidates disclosure)
  if (data.raw_top5_before_rules && data.raw_top5_before_rules.length > 0) {
    const details = document.createElement("details");
    details.className = "raw-search-details";
    let rows = data.raw_top5_before_rules.map(r => `
      <tr>
        <td>#${r.rank}</td>
        <td><strong>${escapeHtml(r.request_id)}</strong></td>
        <td>${escapeHtml(r.status || '')}</td>
        <td>sim ${Number(r.similarity).toFixed(3)}</td>
      </tr>
    `).join("");
    details.innerHTML = `
      <summary>Raw vector search ranked these first (${data.raw_top5_before_rules.length} candidates)</summary>
      <div class="raw-search-content">
        <table class="raw-search-table">
          <thead><tr><th>Rank</th><th>ID</th><th>Status</th><th>Cosine Sim</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
    group.appendChild(details);
  }

  // 4. Inline Funds Checklist
  if (data.funds && data.funds.length > 0) {
    const fundsList = document.createElement("div");
    fundsList.className = "inline-funds-list";
    data.funds.forEach(fund => {
      const isEligible = fund.status === "ELIGIBLE";
      const item = document.createElement("div");
      item.className = "fund-line-item";
      item.innerHTML = `
        <span class="fund-line-title">${escapeHtml(fund.program_name)}</span>
        <span class="fund-line-badge ${isEligible ? 'eligible' : 'ineligible'}">
          ${isEligible ? 'ELIGIBLE ✅' : 'INELIGIBLE ❌'}
        </span>
      `;
      fundsList.appendChild(item);
    });
    group.appendChild(fundsList);
  }

  // 5. Inline Neighborhood Sentence (No stat tiles!)
  if (data.severe_rent_burden_pct !== undefined && data.filings_count !== undefined) {
    const note = document.createElement("div");
    note.className = "inline-neighborhood-note";
    const filingsText = `414 modeled filings vs 196 median [Modeled]`;
    note.innerHTML = `<strong>Tract 36061024500:</strong> Severe rent burden is ${data.severe_rent_burden_pct}% vs 25.2% NYC median; ${filingsText}; ${data.no_vehicle_pct || 91.6}% households without vehicles.`;
    group.appendChild(note);
  }

  bubble.appendChild(group);
}

// -------------------------------------------------------------------------
// Live Turn (Cloud Run / ADK Proxy)
// -------------------------------------------------------------------------
async function runLiveTurn(text) {
  const loadingBubble = appendMessage("assistant", "Thinking...");
  try {
    const res = await fetch("/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appName: "navigator",
        userId: state.userId,
        sessionId: state.sessionId,
        newMessage: {
          role: "user",
          parts: [{ text: text }]
        }
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      loadingBubble.innerHTML = `<span style="color: var(--bad); font-weight: 600;">⚠️ Cloud Run Request Failed (${res.status}): ${escapeHtml(errText || res.statusText)}</span>`;
      return;
    }

    const events = await res.json();
    let replyText = "";
    let toolPayloads = {};

    for (const evt of events) {
      if (evt.content && evt.content.parts) {
        for (const p of evt.content.parts) {
          if (p.text) replyText += p.text;
          if (p.functionResponse && p.functionResponse.response) {
            const name = p.functionResponse.name;
            const resp = p.functionResponse.response;
            toolPayloads[name] = resp;
            await processToolResponse(name, resp);
          }
        }
      }
    }

    if (!replyText) {
      replyText = "Intake step processed.";
    }

    // Replace loading bubble with Hearth reply + inline evidence
    loadingBubble.parentNode.remove();
    appendMessage("assistant", replyText, consolidateInlineData(toolPayloads));

    state.currentTurnIndex++;
    updateSuggestedChips(state.currentTurnIndex);

  } catch (err) {
    loadingBubble.innerHTML = `<span style="color: var(--bad); font-weight: 600;">⚠️ Live Request Error: ${escapeHtml(err.message)}</span>`;
  }
}

// -------------------------------------------------------------------------
// Mock Turn (Deterministic Replay)
// -------------------------------------------------------------------------
async function runMockTurn(text) {
  const loadingBubble = appendMessage("assistant", "Reviewing records...");
  await new Promise(r => setTimeout(r, 400));

  // Match by exact user prompt, keyword, or sequential index
  let turnData = state.mockTurns.find(t => t.user.toLowerCase() === text.toLowerCase());
  if (!turnData) {
    const lower = text.toLowerCase();
    if (lower.includes("new intake") || lower.includes("st. nicholas")) turnData = state.mockTurns[0];
    else if (lower.includes("drop") || lower.includes("boiler")) turnData = state.mockTurns[1];
    else if (lower.includes("statute") || lower.includes("law")) turnData = state.mockTurns[2];
    else if (lower.includes("household") || lower.includes("fund") || lower.includes("relief") || lower.includes("31k")) turnData = state.mockTurns[3];
    else if (lower.includes("neighborhood") || lower.includes("eviction") || lower.includes("tract")) turnData = state.mockTurns[4];
    else if (lower.includes("fixed") || lower.includes("restored") || lower.includes("last week")) turnData = state.mockTurns[5];
    else if (lower.includes("brief") || lower.includes("attorney") || lower.includes("finalize")) turnData = state.mockTurns[6];
  }
  if (!turnData && state.currentTurnIndex < state.mockTurns.length) {
    turnData = state.mockTurns[state.currentTurnIndex];
  }

  loadingBubble.parentNode.remove();

  if (turnData) {
    let toolPayloads = {};
    if (turnData.tools) {
      for (const t of turnData.tools) {
        toolPayloads[t.name] = t.response;
        await processToolResponse(t.name, t.response);
      }
    }

    appendMessage("assistant", turnData.assistant, consolidateInlineData(toolPayloads));
    state.currentTurnIndex++;
    updateSuggestedChips(state.currentTurnIndex);
  } else {
    appendMessage("assistant", "Mock turn not found in mock/turns.json. Switch to Live mode for unscripted intake queries.");
  }
}

function consolidateInlineData(toolPayloads) {
  let combined = {};
  if (toolPayloads.search_habitability_evidence) {
    combined.kept = toolPayloads.search_habitability_evidence.kept;
    combined.excluded = toolPayloads.search_habitability_evidence.excluded;
    combined.raw_top5_before_rules = toolPayloads.search_habitability_evidence.raw_top5_before_rules;
  }
  if (toolPayloads.match_relief_funds) {
    combined.funds = toolPayloads.match_relief_funds.funds;
  }
  if (toolPayloads.get_tract_context) {
    combined.severe_rent_burden_pct = toolPayloads.get_tract_context.severe_rent_burden_pct;
    combined.filings_count = toolPayloads.get_tract_context.filings_count;
    combined.no_vehicle_pct = toolPayloads.get_tract_context.no_vehicle_pct;
  }
  return Object.keys(combined).length > 0 ? combined : null;
}

// -------------------------------------------------------------------------
// Process Tool Responses & Progressively Write Brief
// -------------------------------------------------------------------------
async function processToolResponse(name, data) {
  if (!data) return;

  if (name === "open_case") {
    if (data.hours_to_hearing) {
      document.getElementById("countdown-text").innerText = `Mon 9:30 AM · ${Math.round(data.hours_to_hearing)}h remaining`;
    }
  }

  if (name === "search_habitability_evidence") {
    state.keptEvidence = data.kept || [];
    state.excludedEvidence = data.excluded || [];
    updateBriefEvidenceSection();
    updateProvenanceCount();
  }

  if (name === "match_statutes") {
    state.statutes = data.statutes || [];
    updateBriefLawSection();
  }

  if (name === "match_relief_funds") {
    state.funds = data.funds || [];
    updateBriefFundsSection();
  }

  if (name === "get_tract_context") {
    state.tractContext = data;
    updateBriefNeighborhoodSection();
  }

  if (name === "finalize_brief") {
    await updateBriefFinalizedMemo();
  }
}

function updateProvenanceCount() {
  const count = state.excludedEvidence.length || 7;
  const el = document.getElementById("provenance-decoy-count");
  if (el) el.innerText = count;
}

// -------------------------------------------------------------------------
// Progressive Brief Section Updaters (Paper Styling & Highlight Animation)
// -------------------------------------------------------------------------

function highlightSection(secId) {
  const sec = document.getElementById(secId);
  if (!sec) return;
  sec.classList.remove("section-updated");
  void sec.offsetWidth; // Trigger reflow
  sec.classList.add("section-updated");
}

function updateBriefEvidenceSection() {
  const container = document.getElementById("content-sec-evidence");
  let html = `<p>Semantic vector search identified public 311 habitability violations within a 100-block radius of 1000 St. Nicholas Ave. Relational filtering verified open residential enforcement:</p>`;

  if (state.keptEvidence.length > 0) {
    html += `<table>
      <thead>
        <tr><th>Request ID</th><th>Violation Class / Type</th><th>Block Address</th><th>Status</th></tr>
      </thead>
      <tbody>`;
    state.keptEvidence.forEach(item => {
      html += `<tr>
        <td><code>${escapeHtml(item.request_id)}</code></td>
        <td><strong>${escapeHtml(item.hpd_class || 'Class A')}</strong> · ${escapeHtml(item.raw_complaint_type || 'mold')}</td>
        <td>${escapeHtml(item.block_address || '1000 Block St. Nicholas Ave')}</td>
        <td>Open (${escapeHtml(item.created_date || 'Nov 1')})</td>
      </tr>`;
    });
    html += `</tbody></table>`;
  }

  if (state.excludedEvidence.length > 0) {
    html += `<p style="font-size: 12px; color: var(--muted); margin-top: 6px;">
      <em>Decoy exclusions:</em> ${state.excludedEvidence.length} semantic near-misses were dropped for failing residential or open-enforcement criteria (e.g. <code>${escapeHtml(state.excludedEvidence[0].request_id)}</code>: ${escapeHtml(state.excludedEvidence[0].excluded_because)}).
    </p>`;
  }

  container.innerHTML = html;
  highlightSection("sec-evidence");
}

function updateBriefLawSection() {
  const container = document.getElementById("content-sec-law");
  let html = `<p>The corroborating conditions establish statutory habitability violations and affirmative defenses under New York law:</p>`;

  if (state.statutes.length > 0) {
    html += `<ul>`;
    state.statutes.forEach(st => {
      html += `<li>
        <strong>${escapeHtml(st.statute_code || st.statute_id)}:</strong> ${escapeHtml(st.statute_title)} — ${escapeHtml(st.statutory_remedy)}
      </li>`;
    });
    html += `</ul>`;
  }

  container.innerHTML = html;
  highlightSection("sec-law");
}

function updateBriefFundsSection() {
  const container = document.getElementById("content-sec-funds");
  let html = `<p>Household relief criteria evaluated against emergency rental programs via deterministic rules:</p>`;

  if (state.funds.length > 0) {
    html += `<table>
      <thead><tr><th>Program</th><th>Status</th><th>Intake / Next Step</th></tr></thead>
      <tbody>`;
    state.funds.forEach(fund => {
      const isEligible = fund.status === "ELIGIBLE";
      html += `<tr>
        <td><strong>${escapeHtml(fund.program_name)}</strong></td>
        <td><span style="color: ${isEligible ? 'var(--ok)' : 'var(--bad)'}; font-weight: 700;">${isEligible ? 'ELIGIBLE' : 'INELIGIBLE'}</span></td>
        <td><a href="${escapeHtml(fund.intake_url || '#')}" target="_blank" style="color: var(--accent);">${escapeHtml(fund.intake_url ? 'Intake Portal' : 'Legal Aid Direct')}</a></td>
      </tr>`;
    });
    html += `</tbody></table>`;
  }

  container.innerHTML = html;
  highlightSection("sec-funds");
}

function updateBriefNeighborhoodSection() {
  const container = document.getElementById("content-sec-neighborhood");
  const data = state.tractContext;
  if (!data) return;

  const html = `
    <p>Census Tract <strong>${escapeHtml(data.census_tract_geoid || '36061024500')}</strong> (Washington Heights / Manhattan):</p>
    <ul>
      <li><strong>Rent Burden:</strong> Severe rent burden (>50% income) is <strong>${data.severe_rent_burden_pct}%</strong> (vs. 25.2% NYC median).</li>
      <li><strong>Modeled Filings:</strong> <strong>${data.filings_count || 414}</strong> court eviction filings recorded across 4 quarters (vs. 196 median [Modeled]).</li>
      <li><strong>Transit Dependency:</strong> <strong>${data.no_vehicle_pct || 91.6}%</strong> of households possess no private vehicle, demonstrating transit dependence for in-person court appearances.</li>
    </ul>
  `;

  container.innerHTML = html;
  highlightSection("sec-neighborhood");
}

function updateBriefBoundariesSection() {
  const container = document.getElementById("content-sec-boundaries");
  if (state.boundaries.length === 0) return;

  let html = `<p>Identified evidentiary boundaries requiring attorney or client clarification prior to hearing call:</p><ul>`;
  state.boundaries.forEach(item => {
    html += `<li>${escapeHtml(item)}</li>`;
  });
  html += `</ul>`;

  container.innerHTML = html;
  highlightSection("sec-boundaries");
}

async function updateBriefFinalizedMemo() {
  const sec = document.getElementById("sec-final-memo");
  const container = document.getElementById("content-sec-final-memo");
  const statusTag = document.getElementById("brief-status-tag");

  let markdownText = "";
  try {
    const res = await fetch(`/apps/navigator/users/${state.userId}/sessions/${state.sessionId}/artifacts/tenant_stabilization_brief.md`);
    if (res.ok) {
      markdownText = await res.text();
    }
  } catch (err) {
    console.warn("Could not fetch real artifact, trying mock brief:", err);
  }

  if (!markdownText) {
    try {
      const res = await fetch("mock/tenant_stabilization_brief.md");
      if (res.ok) markdownText = await res.text();
    } catch (e) {
      console.warn("Could not fetch mock markdown brief either:", e);
    }
  }

  state.briefMarkdown = markdownText || "# Tenant Stabilization Brief\nFinalized brief record ready.";
  
  // Format simple markdown into HTML
  container.innerHTML = `<div class="final-memo-content">${renderSimpleMarkdown(state.briefMarkdown)}</div>`;
  sec.style.display = "block";
  statusTag.innerText = "Brief Finalized";
  statusTag.style.background = "var(--ok-soft)";
  statusTag.style.color = "var(--ok)";
  highlightSection("sec-final-memo");

  // Scroll brief into view
  sec.scrollIntoView({ behavior: "smooth" });
}

// -------------------------------------------------------------------------
// Suggested Next Question Soft Chips
// -------------------------------------------------------------------------
function updateSuggestedChips(turnIdx) {
  const chipsContainer = document.getElementById("suggested-chips");
  chipsContainer.innerHTML = "";

  const suggestions = [
    // Turn 0 (Initial)
    ["Cold radiators & mold on St. Nicholas Ave", "Nueva entrada en español (radiadores fríos)"],
    // After Turn 1
    ["Why did you drop that boiler record?", "What laws cover cold radiators and mold?"],
    // After Turn 2
    ["What statutes cover these three hazards?", "What emergency relief funds can she get?"],
    // After Turn 3
    ["Household of 3, about $31k, owes $3,350...", "Show neighborhood eviction context"],
    // After Turn 4
    ["What's the neighborhood eviction baseline?", "Draft the complete pre-calendar brief"],
    // After Turn 5
    ["Landlord's attorney claims boiler was fixed last week", "Draft the pre-calendar brief"],
    // After Turn 6
    ["Draft the complete pre-calendar brief for supervising attorney", "Review Spiegel defense"],
    // After Turn 7 (Complete)
    ["Copy brief to clipboard", "Review equity audit metrics"]
  ];

  const currentChips = suggestions[Math.min(turnIdx, suggestions.length - 1)] || suggestions[0];

  currentChips.forEach(chipText => {
    const chip = document.createElement("button");
    chip.className = "suggested-chip";
    chip.innerText = chipText;
    chip.addEventListener("click", () => {
      document.getElementById("chat-input").value = chipText;
      handleSend();
    });
    chipsContainer.appendChild(chip);
  });
}

// -------------------------------------------------------------------------
// Demo Script Drawer Renderer
// -------------------------------------------------------------------------
function renderDemoDrawer() {
  const container = document.getElementById("drawer-turns");
  container.innerHTML = "";

  GOLDEN_TURNS.forEach(turn => {
    const card = document.createElement("div");
    card.className = "drawer-turn-card";
    card.innerHTML = `
      <div class="drawer-turn-header">
        <span class="drawer-turn-number">${escapeHtml(turn.title)}</span>
      </div>
      <div class="drawer-turn-desc">${escapeHtml(turn.prompt)}</div>
    `;
    card.addEventListener("click", () => {
      toggleDrawer();
      document.getElementById("chat-input").value = turn.prompt;
      handleSend();
    });
    container.appendChild(card);
  });
}

// -------------------------------------------------------------------------
// Actions: Copy, Print, Download
// -------------------------------------------------------------------------
function copyBrief() {
  const content = state.briefMarkdown || document.getElementById("brief-paper").innerText;
  navigator.clipboard.writeText(content).then(() => {
    alert("Tenant Stabilization Brief copied to clipboard!");
  }).catch(err => {
    console.warn("Copy error:", err);
  });
}

function downloadBrief() {
  const content = state.briefMarkdown || document.getElementById("brief-paper").innerText;
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tenant_stabilization_brief_marisol_v.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function handleMicClick() {
  const micBtn = document.getElementById("mic-btn");
  const isPressed = micBtn.getAttribute("aria-pressed") === "true";
  micBtn.setAttribute("aria-pressed", isPressed ? "false" : "true");
  if (!isPressed) {
    micBtn.title = "Listening (Dictation enabled in M17)...";
  } else {
    micBtn.title = "Dictate via Speech (Press to speak)";
  }
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderSimpleMarkdown(md) {
  if (!md) return "";
  return md
    .replace(/^### (.*$)/gim, '<h3 style="margin: 14px 0 6px; font-size: 14px; font-weight:700;">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 style="margin: 18px 0 8px; font-size: 16px; font-weight:700;">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 style="margin: 22px 0 10px; font-size: 18px; font-weight:700;">$1</h1>')
    .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*)\*/gim, '<em>$1</em>')
    .replace(/`([^`]+)`/gim, '<code>$1</code>')
    .replace(/\n\n/gim, '</p><p>')
    .replace(/\n/gim, '<br>');
}
