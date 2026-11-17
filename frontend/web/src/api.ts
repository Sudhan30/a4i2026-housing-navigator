// Talks to the ADK agent through frontend/server.py (same origin), or replays
// mock/turns.json when the page is opened with ?mock=1.

export type Check = {rule: string; pass: boolean | null; detail: string};
export type Fund = {
  bulletin_id: string;
  program_name: string;
  administering_agency: string;
  max_award_usd: number | null;
  status: 'ELIGIBLE' | 'INELIGIBLE' | 'NEEDS INFO';
  checks: Check[];
  intake_url: string;
};
export type Record311 = {
  request_id: string;
  block_address: string;
  raw_complaint_type: string;
  inspection_status: string;
  created_date: string;
  similarity: number;
  complaint_narrative?: string;
  excluded_because?: string;
};
export type RawCandidate = {rank: number; request_id: string; similarity: number; status: string; property_type: string};
export type Evidence = {kept: Record311[]; excluded: Record311[]; raw_top5_before_rules?: RawCandidate[]};
export type Statute = {code_citation: string; ordinance_title: string; raw_statute_text: string};
export type Tract = {
  census_tract_geoid: string;
  severe_rent_burden_pct: number;
  metro_severe_rent_burden_pct?: number;
  annual_nonpayment_filings_modeled: number;
  median_tract_nonpayment_filings_modeled?: number;
  no_vehicle_pct: number;
};

export type ToolResult = {name: string; response: any};
export type TurnResult = {text: string; tools: ToolResult[]};

export const IS_MOCK = new URLSearchParams(location.search).get('mock') === '1';
const APP = 'navigator';
const USER = 'intake-desk';
export const SESSION_ID = `desk-${Date.now().toString(36)}`;

let sessionReady: Promise<void> | null = null;
function ensureSession(): Promise<void> {
  sessionReady ??= fetch(`/apps/${APP}/users/${USER}/sessions/${SESSION_ID}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: '{}',
  }).then(r => {
    if (!r.ok && r.status !== 409) throw new Error(`Could not start a session (HTTP ${r.status})`);
  });
  return sessionReady;
}

export async function sendTurn(text: string): Promise<TurnResult> {
  if (IS_MOCK) return mockTurn(text);
  await ensureSession();
  const res = await fetch('/run', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      appName: APP,
      userId: USER,
      sessionId: SESSION_ID,
      newMessage: {role: 'user', parts: [{text}]},
    }),
  });
  if (!res.ok) throw new Error(`Agent error (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
  const events: any[] = await res.json();
  const tools: ToolResult[] = [];
  let out = '';
  for (const e of events) {
    for (const p of e?.content?.parts ?? []) {
      if (p.functionResponse) tools.push({name: p.functionResponse.name, response: p.functionResponse.response});
      else if (p.text) out += (out ? '\n\n' : '') + p.text;
    }
  }
  return {text: out.trim(), tools};
}

export async function fetchBrief(): Promise<string | null> {
  if (IS_MOCK) {
    const r = await fetch('mock/tenant_stabilization_brief.md');
    return r.ok ? r.text() : null;
  }
  const r = await fetch(`/apps/${APP}/users/${USER}/sessions/${SESSION_ID}/artifacts/tenant_stabilization_brief.md`);
  if (!r.ok) return null;
  const a = await r.json();
  return a?.text ?? a?.inlineData?.data ?? null;
}

// ---- mock replay -------------------------------------------------------
let mockTurns: any[] | null = null;
let mockIndex = 0;
async function mockTurn(text: string): Promise<TurnResult> {
  mockTurns ??= await (await fetch('mock/turns.json')).json();
  const turns = mockTurns!;
  const t = turns.find(x => x.user?.toLowerCase() === text.toLowerCase()) ?? turns[mockIndex % turns.length];
  mockIndex++;
  await new Promise(r => setTimeout(r, 600));
  return {text: t.assistant ?? '', tools: (t.tools ?? []).map((x: any) => ({name: x.name, response: x.response}))};
}
