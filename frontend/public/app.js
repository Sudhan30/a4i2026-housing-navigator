// Stabilization Navigator - Intake Desk Client

const LIVE_API_BASE = window.location.origin;
let isMockMode = new URLSearchParams(window.location.search).get("mock") === "1";
let mockTurns = [];
let currentTurnIndex = 0;
let sessionId = "sess_intake_" + Math.random().toString(36).substring(2, 9);
let userId = "paralegal_marisol";

// State
let caseData = {
  address: "1000 Block St. Nicholas Ave, Manhattan",
  hearing: "Mon 9:30 AM",
  hoursLeft: "89h remaining",
  keptEvidence: [],
  excludedEvidence: [],
  statutes: [],
  funds: [],
  tractContext: null,
  briefContent: ""
};

// Quick Prompts
const QUICK_PROMPTS = [
  "New intake. Tenant on the 1000 block of St. Nicholas Ave, Manhattan. Nonpayment hearing Monday 9:30. Radiators cold since early Nov, black mold around the tub, water coming through the bathroom wall. Anything open on her block?",
  "Why did you drop that boiler record? It looked like an exact match.",
  "What law covers this?",
  "Household of 3, about $31k a year, she has the court index number. Her daughter has asthma that's gotten worse.",
  "How bad is this neighborhood compared to the city?",
  "Landlord's lawyer says the boiler was fixed last week.",
  "Draft the brief for the attorney."
];

// Initialize
document.addEventListener("DOMContentLoaded", async () => {
  setupTabs();
  setupControls();
  renderQuickPrompts();
  
  try {
    const res = await fetch("mock/turns.json");
    mockTurns = await res.json();
  } catch (e) {
    console.warn("Could not load mock turns:", e);
  }

  if (isMockMode) {
    setMode(true);
  } else {
    setMode(false);
    await initSession();
  }

  // Preload initial welcome
  appendMessage("assistant", "Intake Navigator active. Case Marisol V. loaded (1000 Block St. Nicholas Ave). Ready for intake questions or click a turn below.");
});

async function initSession() {
  if (isMockMode) return;
  try {
    const sResp = await fetch(`${LIVE_API_BASE}/apps/navigator/users/${userId}/sessions/${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    // Ignore 409 (already exists)
    if (!sResp.ok && sResp.status !== 409) {
      console.warn("Session init status:", sResp.status);
    }
  } catch (err) {
    console.warn("Session init error:", err);
  }
}

function setupControls() {
  document.getElementById("mode-mock-btn").addEventListener("click", () => setMode(true));
  document.getElementById("mode-live-btn").addEventListener("click", () => setMode(false));
  document.getElementById("send-btn").addEventListener("click", handleSend);
  document.getElementById("chat-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSend();
  });
  document.getElementById("copy-brief-btn").addEventListener("click", () => {
    navigator.clipboard.writeText(caseData.briefContent || document.getElementById("brief-content").innerText);
    alert("Brief copied to clipboard!");
  });
  document.getElementById("print-brief-btn").addEventListener("click", () => {
    window.print();
  });
}

function setMode(mock) {
  isMockMode = mock;
  document.getElementById("mode-mock-btn").classList.toggle("active", mock);
  document.getElementById("mode-live-btn").classList.toggle("active", !mock);
  document.getElementById("footer-status").innerText = mock ? "Mode: Mock Replay (turns.json)" : "Mode: Live Cloud Run (ADK)";
}

function setupTabs() {
  const tabs = document.querySelectorAll(".tab-btn");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.dataset.tab;
      document.getElementById(`tab-${target}`).classList.add("active");
    });
  });
}

function renderQuickPrompts() {
  const container = document.getElementById("quick-prompts");
  container.innerHTML = "";
  QUICK_PROMPTS.forEach((p, idx) => {
    const btn = document.createElement("button");
    btn.className = "quick-btn";
    btn.innerText = `Turn ${idx + 1}`;
    btn.title = p;
    btn.addEventListener("click", () => {
      document.getElementById("chat-input").value = p;
      handleSend();
    });
    container.appendChild(btn);
  });
}

async function handleSend() {
  const input = document.getElementById("chat-input");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";

  appendMessage("user", text);

  if (isMockMode) {
    await runMockTurn(text);
  } else {
    await runLiveTurn(text);
  }
}

function appendMessage(role, text, toolPill = null) {
  const messagesDiv = document.getElementById("chat-messages");
  const msgEl = document.createElement("div");
  msgEl.className = `message ${role}`;

  const labelEl = document.createElement("div");
  labelEl.className = "message-label";
  labelEl.innerText = role === "user" ? "Paralegal (Dev)" : "Stabilization Navigator";
  msgEl.appendChild(labelEl);

  if (toolPill) {
    const pill = document.createElement("div");
    pill.className = "tool-pill";
    pill.innerHTML = `⚙️ ${toolPill}`;
    msgEl.appendChild(pill);
  }

  const bubbleEl = document.createElement("div");
  bubbleEl.className = "message-bubble";
  bubbleEl.innerHTML = formatMarkdown(text);
  msgEl.appendChild(bubbleEl);

  messagesDiv.appendChild(msgEl);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function formatMarkdown(text) {
  if (!text) return "";
  let html = text
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    .replace(/`([^`]+)`/gim, '<code>$1</code>')
    .replace(/\n\n/gim, '<br><br>')
    .replace(/^\- (.*$)/gim, '<li>$1</li>');
  return html;
}

// Mock Runner
async function runMockTurn(userText) {
  // Find matching turn or use index
  let turn = mockTurns.find(t => t.user.toLowerCase() === userText.toLowerCase());
  if (!turn) {
    turn = mockTurns[currentTurnIndex % mockTurns.length];
  }
  currentTurnIndex++;

  // Simulate tool calls
  for (const t of turn.tools) {
    processToolResponse(t.name, t.response);
  }

  const toolsSummary = turn.tools.map(t => t.name).join(", ");
  setTimeout(() => {
    appendMessage("assistant", turn.assistant, toolsSummary || null);
  }, 300);
}

// Live Runner against Cloud Run ADK endpoint
async function runLiveTurn(userText) {
  appendMessage("assistant", "<em>Searching records and analyzing housing code...</em>");
  const loadingBubble = document.querySelector(".message.assistant:last-child .message-bubble");

  try {
    const resp = await fetch(`${LIVE_API_BASE}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appName: "navigator",
        userId: userId,
        sessionId: sessionId,
        newMessage: {
          role: "user",
          parts: [{ text: userText }]
        }
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Agent /run error HTTP ${resp.status}: ${errText}`);
    }

    const events = await resp.json();
    let replyText = "";
    let toolsCalled = [];

    for (const e of events) {
      if (e.content && e.content.parts) {
        for (const p of e.content.parts) {
          if (p.text) {
            replyText += p.text + "\n\n";
          } else if (p.functionCall) {
            toolsCalled.push(p.functionCall.name);
          } else if (p.functionResponse) {
            const toolName = p.functionResponse.name;
            const toolData = p.functionResponse.response;
            await processToolResponse(toolName, toolData);
          }
        }
      }
    }

    if (loadingBubble) {
      loadingBubble.innerHTML = formatMarkdown(replyText || "Done.");
      if (toolsCalled.length > 0) {
        const pill = document.createElement("div");
        pill.className = "tool-pill";
        pill.innerHTML = `⚙️ ${toolsCalled.join(", ")}`;
        loadingBubble.parentNode.insertBefore(pill, loadingBubble);
      }
    }
  } catch (err) {
    if (loadingBubble) {
      loadingBubble.innerHTML = `<span style="color: var(--accent-red); font-weight: 600;">⚠️ Live Request Error: ${err.message}</span>`;
    }
    console.error("Live turn error:", err);
  }
}

// Process Tool Responses to Update Case File Card
async function processToolResponse(name, data) {
  if (!data) return;

  if (name === "open_case") {
    if (data.hours_to_hearing) {
      document.getElementById("hearing-countdown").innerText = `Mon 9:30 AM · ${Math.round(data.hours_to_hearing)}h remaining`;
    }
  }

  if (name === "search_habitability_evidence") {
    if (data.kept) {
      caseData.keptEvidence = data.kept;
    }
    if (data.excluded) {
      caseData.excludedEvidence = data.excluded;
    }
    renderEvidenceTab(data);
    switchTab("evidence");
  }

  if (name === "match_statutes") {
    if (data.statutes) {
      caseData.statutes = data.statutes;
      renderLawTab(data.statutes);
      switchTab("law");
    }
  }

  if (name === "match_relief_funds") {
    if (data.funds) {
      caseData.funds = data.funds;
      renderFundsTab(data.funds);
      switchTab("funds");
    }
  }

  if (name === "get_tract_context") {
    caseData.tractContext = data;
    renderTractSummary(data);
  }

  if (name === "finalize_brief") {
    await renderBriefTab();
    switchTab("brief");
  }
}

function switchTab(tabName) {
  const tabBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  if (tabBtn) tabBtn.click();
}

function renderEvidenceTab(data) {
  const container = document.getElementById("tab-evidence");
  const keptCount = data.kept ? data.kept.length : 0;
  const decoyCount = data.excluded ? data.excluded.length : 0;
  document.getElementById("badge-evidence").innerText = `${keptCount} kept / ${decoyCount} excl`;

  let html = `<div class="section-title">
    <span>Corroborating Records (100-Block Radius)</span>
    <span style="color: var(--accent-green); font-size: 11px;">PASS: ${keptCount} residential</span>
  </div>`;

  if (data.kept && data.kept.length > 0) {
    data.kept.forEach(item => {
      html += `
        <div class="card kept">
          <div class="card-header">
            <span class="req-id">✅ ${item.request_id}</span>
            <span class="sim-score">Sim: ${Number(item.similarity).toFixed(3)}</span>
          </div>
          <div class="card-body">
            <strong>${item.raw_complaint_type || item.inspection_status}</strong><br>
            <span style="color: var(--text-muted);">${item.block_address} · Created: ${item.created_date || '2026-11-01'}</span>
          </div>
        </div>
      `;
    });
  }

  html += `<div class="section-title" style="margin-top: 16px;">
    <span>Excluded Near-Matches (Filtered Decoys)</span>
    <span style="color: var(--accent-red); font-size: 11px;">REJECTED: ${decoyCount} Traps</span>
  </div>`;

  if (data.excluded && data.excluded.length > 0) {
    data.excluded.forEach(item => {
      html += `
        <div class="card excluded">
          <div class="card-header">
            <span class="req-id">🚫 ${item.request_id}</span>
            <span class="sim-score">Sim: ${Number(item.similarity || 0.75).toFixed(3)}</span>
          </div>
          <div class="card-body">
            <div class="card-reason">⚠️ ${item.excluded_because || 'Commercial property or closed enforcement case'}</div>
          </div>
        </div>
      `;
    });
  }

  container.innerHTML = html;
}

function renderFundsTab(funds) {
  const container = document.getElementById("tab-funds");
  document.getElementById("badge-funds").innerText = `${funds.length} funds`;

  let html = `<div class="section-title">
    <span>Emergency Rental Stabilization Funds</span>
    <span style="color: var(--accent-cyan); font-size: 11px;">Python Rule Engine</span>
  </div>`;

  funds.forEach(fund => {
    const statusClass = fund.status === "ELIGIBLE" ? "eligible" : (fund.status === "INELIGIBLE" ? "ineligible" : "needs-info");
    const checksList = (fund.checks && fund.checks.length > 0)
      ? fund.checks.map(c => `<li>${c.pass ? '✅' : '❌'} <strong>${c.rule}</strong>: ${c.detail}</li>`).join("")
      : (fund.reasons || []).map(r => `<li>${r}</li>`).join("");

    html += `
      <div class="fund-card">
        <div class="fund-header">
          <span class="fund-name">${fund.program_name}</span>
          <span class="fund-status ${statusClass}">${fund.status}</span>
        </div>
        <div class="fund-agency">${fund.administering_agency} · Max: <span class="fund-award">$${Number(fund.max_award_usd).toLocaleString()} USD</span></div>
        <ul class="fund-checks">
          ${checksList}
        </ul>
        <a href="${fund.intake_url}" target="_blank" style="color: var(--accent-blue); font-size: 11px; text-decoration: none;">🔗 Agency Intake Portal &rarr;</a>
      </div>
    `;
  });

  container.innerHTML = html;
}

function renderLawTab(statutes) {
  const container = document.getElementById("tab-law");
  document.getElementById("badge-law").innerText = `${statutes.length} statutes`;

  let html = `<div class="section-title">
    <span>Statutory Protections & Defenses</span>
    <span style="color: var(--accent-amber); font-size: 11px;">NYC / NY State Code</span>
  </div>`;

  statutes.forEach(st => {
    html += `
      <div class="card" style="border-left: 3px solid var(--accent-amber);">
        <div class="card-header">
          <strong style="color: var(--accent-amber);">${st.code_citation}</strong>
        </div>
        <div class="card-body">
          <p style="font-weight: 600; margin-bottom: 4px;">${st.ordinance_title}</p>
          <p style="color: var(--text-muted); font-size: 11.5px;">${st.raw_statute_text}</p>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function renderTractSummary(t) {
  let grid = document.getElementById("stat-grid");
  if (!grid) {
    grid = document.createElement("div");
    grid.id = "stat-grid";
    grid.className = "stat-grid";
    const content = document.querySelector(".case-content");
    content.insertBefore(grid, content.firstChild);
  }

  grid.innerHTML = `
    <div class="stat-box">
      <div class="stat-value">${t.severe_rent_burden_pct}%</div>
      <div class="stat-label">Severe Rent Burden (Metro: ${t.metro_severe_rent_burden_pct}%)</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${t.annual_nonpayment_filings_modeled}</div>
      <div class="stat-label">[Modeled] Filings/Yr (Tract Median: ${t.median_tract_nonpayment_filings_modeled})</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${t.no_vehicle_pct}%</div>
      <div class="stat-label">No Vehicle Rate (Transit Barrier)</div>
    </div>
  `;
}

async function renderBriefTab() {
  const container = document.getElementById("brief-content");
  document.getElementById("badge-brief").innerText = "Loading...";

  try {
    let briefText = "";
    if (isMockMode) {
      const resp = await fetch("mock/tenant_stabilization_brief.md");
      if (resp.ok) {
        briefText = await resp.text();
      }
    } else {
      const url = `${LIVE_API_BASE}/apps/navigator/users/${userId}/sessions/${sessionId}/artifacts/tenant_stabilization_brief.md`;
      const resp = await fetch(url);
      if (resp.ok) {
        try {
          const data = await resp.json();
          briefText = data.text || "";
        } catch (e) {
          briefText = await resp.text();
        }
      }
    }

    if (briefText) {
      caseData.briefContent = briefText;
      container.innerHTML = formatMarkdown(briefText);
      document.getElementById("badge-brief").innerText = "Ready";
      return;
    }
  } catch (err) {
    console.warn("Artifact fetch error:", err);
  }

  container.innerHTML = `<p style="color: var(--text-muted); font-style: italic; padding: 24px 16px; text-align: center;">Tenant stabilization brief not yet drafted. Complete intake questions or click Turn 7 to draft the court brief.</p>`;
  document.getElementById("badge-brief").innerText = "Pending";
}

