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
  latitude?: number;
  longitude?: number;
};
export type RawCandidate = {rank: number; request_id: string; similarity: number; status: string; property_type: string};
export type Evidence = {
  kept: Record311[];
  excluded: Record311[];
  raw_top5_before_rules?: RawCandidate[];
  map?: {anchor: {lat: number; lng: number} | null; radius_m: number};
};
export type Statute = {code_citation: string; ordinance_title: string; raw_statute_text: string};
export type Tract = {
  census_tract_geoid: string;
  severe_rent_burden_pct: number;
  metro_severe_rent_burden_pct?: number;
  annual_nonpayment_filings_modeled: number;
  median_tract_nonpayment_filings_modeled?: number;
  no_vehicle_pct: number;
};

export type ToolResult = {name: string; response: any; args?: any};
export type TurnResult = {text: string; tools: ToolResult[]};

export const IS_MOCK = new URLSearchParams(location.search).get('mock') === '1';
const APP = 'navigator';
const USER = 'intake-desk';
export let SESSION_ID = `desk-${Date.now().toString(36)}`;

let sessionReady: Promise<void> | null = null;
/** Start a fresh agent session (used when switching or reopening cases). */
export function resetSession() {
  SESSION_ID = `desk-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  sessionReady = null;
}
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
  if (!res.ok) {
    const body = await res.text();
    let msg = body.slice(0, 200);
    try {
      msg = JSON.parse(body).error ?? msg;
    } catch {}
    throw new Error(res.status === 504 || res.status === 502 ? msg : `Agent error (HTTP ${res.status}): ${msg}`);
  }
  const events: any[] = await res.json();
  const tools: ToolResult[] = [];
  const args: Record<string, any> = {};
  let out = '';
  for (const e of events) {
    for (const p of e?.content?.parts ?? []) {
      if (p.functionCall) args[p.functionCall.name] = p.functionCall.args;
      if (p.functionResponse)
        tools.push({name: p.functionResponse.name, response: p.functionResponse.response, args: args[p.functionResponse.name]});
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
  return {text: t.assistant ?? '', tools: (t.tools ?? []).map((x: any) => ({name: x.name, response: x.response, args: x.args}))};
}

// ---- Google Cloud speech + maps ----------------------------------------
let configPromise: Promise<{mapsApiKey: string}> | null = null;
export function getConfig() {
  configPromise ??= fetch('/config.json')
    .then(r => (r.ok ? r.json() : {mapsApiKey: ''}))
    .catch(() => ({mapsApiKey: ''}));
  return configPromise;
}

/** Cloud Speech-to-Text via frontend/server.py. */
export async function transcribe(audio: Blob, lang: string): Promise<string> {
  const r = await fetch(`/stt?lang=${encodeURIComponent(lang)}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/octet-stream'},
    body: audio,
  });
  if (!r.ok) throw new Error(`Speech-to-Text failed (HTTP ${r.status})`);
  return (await r.json()).transcript ?? '';
}

/** Cloud Text-to-Speech via frontend/server.py; returns an object URL for an MP3. */
export async function speak(text: string, lang = 'en-US'): Promise<string> {
  const r = await fetch('/tts', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({text, lang}),
  });
  if (!r.ok) throw new Error(`Text-to-Speech failed (HTTP ${r.status})`);
  return URL.createObjectURL(await r.blob());
}

// ---- Saved cases (Firestore via frontend/server.py) ---------------------
export type CaseSummary = {
  id: string;
  title?: string;
  block?: string;
  hearingAt?: number;
  hearingLabel?: string;
  status?: 'draft' | 'ready' | 'edited' | 'closed';
  worstHazard?: string;
  nextAction?: string;
  recordCount?: number;
  eligibleFunds?: number;
  edited?: boolean;
  updatedAt?: string;
};

export async function listCases(): Promise<CaseSummary[]> {
  if (IS_MOCK) return [];
  const r = await fetch('/api/cases');
  if (!r.ok) throw new Error(`Could not load cases (HTTP ${r.status})`);
  return (await r.json()).cases ?? [];
}
export async function getCase(id: string): Promise<any | null> {
  const r = await fetch(`/api/cases/${encodeURIComponent(id)}`);
  return r.ok ? r.json() : null;
}
export class CaseDeletedError extends Error {
  constructor() {
    super('This case was deleted in another window. Changes here are no longer saved.');
  }
}
export async function saveCase(id: string, data: unknown): Promise<void> {
  if (IS_MOCK) return;
  const r = await fetch(`/api/cases/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data),
  });
  if (r.status === 410) throw new CaseDeletedError();
  if (!r.ok) throw new Error(`Could not save case (HTTP ${r.status})`);
}
export function newCaseId() {
  return `case-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export async function deleteCase(id: string): Promise<void> {
  const r = await fetch(`/api/cases/${encodeURIComponent(id)}`, {method: 'DELETE'});
  if (!r.ok) throw new Error(`Could not delete case (HTTP ${r.status})`);
}

// ---- Attachments (Gemini 2.5 Flash via frontend/server.py) --------------
export type PhotoResult = {
  is_housing_condition: boolean;
  condition: string;
  observed: string;
  hazard_estimate: 'Immediately hazardous' | 'Hazardous' | 'Non-hazardous' | 'Unclear';
  matching_hazards: string[];
  cannot_prove: string[];
};
export type NoticeResult = {
  is_court_document: boolean;
  document_type: string;
  index_number?: string | null;
  hearing_datetime?: string | null;
  court?: string | null;
  arrears_usd?: number | null;
  landlord_or_petitioner?: string | null;
  date_served_or_dated?: string | null;
  notes?: string;
};

async function postBlob<T>(path: string, blob: Blob, mime: string): Promise<T> {
  const r = await fetch(`${path}?mime=${encodeURIComponent(mime)}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/octet-stream'},
    body: blob,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Request failed (HTTP ${r.status})`);
  return j as T;
}
export const inspectPhoto = (b: Blob, mime: string) => postBlob<{result: PhotoResult}>('/api/inspect-photo', b, mime).then(x => x.result);
export const readNotice = (b: Blob, mime: string) => postBlob<{result: NoticeResult}>('/api/read-notice', b, mime).then(x => x.result);
export const transcribeFile = (b: Blob, mime: string) => postBlob<{transcript: string}>('/api/transcribe-file', b, mime).then(x => x.transcript);

/** Downscale an image file to a JPEG blob (for upload) and a small data URL (for the saved case). */
export async function prepareImage(file: File, maxUpload = 1600, maxThumb = 360): Promise<{upload: Blob; thumb: string}> {
  const bmp = await createImageBitmap(file);
  const draw = (max: number) => {
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    return c;
  };
  const upload = await new Promise<Blob>(res => draw(maxUpload).toBlob(b => res(b!), 'image/jpeg', 0.88));
  const thumb = draw(maxThumb).toDataURL('image/jpeg', 0.75);
  return {upload, thumb};
}
