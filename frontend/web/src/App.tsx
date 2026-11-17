import {useEffect, useMemo, useRef, useState} from 'react';
import {
  ChatComposer,
  ChatLayout,
  ChatMessage,
  ChatMessageBubble,
  ChatMessageList,
  ChatToolCalls,
} from '@astryxdesign/core/Chat';
import {Button} from '@astryxdesign/core/Button';
import {Badge} from '@astryxdesign/core/Badge';
import {Markdown} from '@astryxdesign/core/Markdown';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import {Spinner} from '@astryxdesign/core/Spinner';
import {Text} from '@astryxdesign/core/Text';
import {
  IS_MOCK,
  sendTurn,
  fetchBrief,
  getCase,
  saveCase,
  CaseDeletedError,
  newCaseId,
  resetSession,
  type Evidence,
  type Fund,
  type Statute,
  type Tract,
  type ToolResult,
  type NoticeResult,
} from './api';
import {EvidenceBlock, FundsBlock, topSetAside} from './Blocks';
import {BriefDrawer, BriefPanel, type BriefEdits, type Draft, type PanelMode} from './BriefDrawer';
import {HearthMark} from './HearthMark';
import {Caseload} from './Caseload';
import {AttachButton, AttachmentCard, type Attachment} from './Attach';
import {HAZARD_CLASS, violationClass} from './hazards';
import {MicButton, ReadAloud} from './Voice';

type Msg =
  | {id: number; role: 'user'; text: string}
  | {id: number; role: 'assistant'; text: string; tools: ToolResult[]}
  | {id: number; role: 'error'; text: string}
  | {id: number; role: 'attachment'; att: Attachment};

const GOLDEN = [
  "New intake. Tenant on the 1000 block of St. Nicholas Ave, Manhattan. Nonpayment hearing Monday 9:30. Radiators cold since early Nov, black mold around the tub, water coming through the bathroom wall. Anything open on her block?",
  'Why did you set aside the top look-alike? It looked like a strong match.',
  'What law covers this?',
  "Household of 3, about $31k a year, owes $3,350, has the court index number. Her daughter's asthma is worse.",
  'How bad is this neighborhood compared to the city?',
  "Landlord's lawyer says the boiler was fixed last week.",
  'Draft the brief for the attorney.',
];

const TOOL_LABELS: Record<string, string> = {
  open_case: 'Opened case file',
  update_case: 'Updated household facts',
  search_habitability_evidence: 'Searched 311 records by meaning',
  match_statutes: 'Matched housing statutes',
  match_relief_funds: 'Checked relief fund rules',
  find_tract_for_block: 'Located census tract',
  get_tract_context: 'Pulled neighborhood context',
  finalize_brief: 'Wrote the brief',
};

const WORKING = ['Reading the intake…', 'Searching 311 records by meaning…', 'Checking the rules…', 'Writing it up…'];

function useWide(query = '(min-width: 1100px)') {
  const [wide, setWide] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return wide;
}

export default function App() {
  const wide = useWide();
  const [mode, setMode] = useState<PanelMode>('split');
  const [briefW, setBriefW] = useState(() => {
    try {
      return Number(localStorage.getItem('hearth.briefW')) || 520;
    } catch {
      return 520;
    }
  });
  function startDrag(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const w = Math.min(Math.max(window.innerWidth - ev.clientX, 340), window.innerWidth - 420);
      setBriefW(w);
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      setBriefW(w => {
        try {
          localStorage.setItem('hearth.briefW', String(Math.round(w)));
        } catch {}
        return w;
      });
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  }
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [pending, setPending] = useState(false);
  const [workingIdx, setWorkingIdx] = useState(0);
  const [value, setValue] = useState('');
  const [lang, setLang] = useState<'en-US' | 'es-US'>('en-US');
  const [hours, setHours] = useState<number | null>(null);
  const [hearingAt, setHearingAt] = useState<number | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick(x => x + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  const [urgent, setUrgent] = useState(false);
  const [block, setBlock] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({cantProve: []});
  const [brief, setBrief] = useState<string | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);
  const nextId = useRef(1);

  // Saved cases (Firestore). The URL hash holds the open case: #case=<id>.
  const [caseId, setCaseId] = useState<string | null>(() => new URLSearchParams(location.hash.slice(1)).get('case'));
  const [casesOpen, setCasesOpen] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [loadingCase, setLoadingCase] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Human-in-the-loop edits to the worksheet.
  const [version, setVersion] = useState(0);
  const [editHtml, setEditHtml] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editedAt, setEditedAt] = useState(0);
  const edits: BriefEdits = {
    html: editHtml,
    editing,
    stale: editHtml !== null && version > editedAt,
    start: html => {
      setEditHtml(html);
      setEditing(true);
      setEditedAt(version);
    },
    save: html => {
      setEditHtml(html);
      setEditing(false);
    },
    discard: () => {
      setEditHtml(null);
      setEditing(false);
    },
    keep: () => setEditedAt(version),
  };


  useEffect(() => {
    if (!pending) return;
    setWorkingIdx(0);
    const t = setInterval(() => setWorkingIdx(i => Math.min(i + 1, WORKING.length - 1)), 3500);
    return () => clearInterval(t);
  }, [pending]);

  function resetCaseState() {
    setMsgs([]);
    setDraft({cantProve: []});
    setBrief(null);
    setHours(null);
    setHearingAt(null);
    setBlock(null);
    setEditHtml(null);
    setEditing(false);
    setVersion(0);
    setEditedAt(0);
    setUrgent(false);
  }

  async function openCase(id: string) {
    setCasesOpen(false);
    setLoadingCase(true);
    try {
      const c = await getCase(id);
      if (!c) throw new Error('Case not found');
      resetCaseState();
      setMsgs(c.msgs ?? []);
      setDraft(c.draft ?? {cantProve: []});
      setBrief(c.brief ?? null);
      setBlock(c.block ?? null);
      setHearingAt(c.hearingAt ?? null);
      setEditHtml(c.editHtml ?? null);
      nextId.current = Math.max(0, ...(c.msgs ?? []).map((m: Msg) => m.id)) + 1;
      setCaseId(id);
      history.replaceState(null, '', `#case=${id}`);
      resetSession();
      setResumed(true);
    } catch (e) {
      setMsgs(m => [...m, {id: nextId.current++, role: 'error', text: (e as Error).message}]);
    } finally {
      setLoadingCase(false);
    }
  }

  function newCase() {
    setCasesOpen(false);
    resetCaseState();
    setCaseId(null);
    setResumed(false);
    history.replaceState(null, '', location.pathname + location.search);
    resetSession();
  }

  useEffect(() => {
    if (caseId) openCase(caseId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave the open case after each change (debounced).
  useEffect(() => {
    if (!caseId || msgs.length === 0 || loadingCase || pending || IS_MOCK) return;
    const t = setTimeout(async () => {
      setSaveState('saving');
      try {
        await saveCase(caseId, buildCaseDoc({msgs, draft, brief, block, hearingAt, editHtml}));
        setSaveState('saved');
      } catch (e) {
        setSaveState('error');
        if (e instanceof CaseDeletedError) {
          setCaseId(null);
          history.replaceState(null, '', location.pathname + location.search);
          setMsgs(m => [...m, {id: nextId.current++, role: 'error', text: e.message}]);
        }
      }
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, msgs, draft, brief, editHtml, pending]);

  function addAttachment(att: Attachment) {
    if (!caseId) {
      const id = newCaseId();
      setCaseId(id);
      history.replaceState(null, '', '#case=' + id);
    }
    setMsgs(m => [...m, {id: nextId.current++, role: 'attachment', att}]);
    if (att.kind === 'photo' && att.result.is_housing_condition) {
      const r = att.result;
      setDraft(d => ({
        ...d,
        photos: [...(d.photos ?? []), {thumb: att.thumb, condition: r.condition, observed: r.observed, estimate: r.hazard_estimate, cannotProve: r.cannot_prove}],
      }));
      setVersion(v => v + 1);
    }
  }
  function useNotice(n: NoticeResult) {
    setDraft(d => ({...d, notice: n}));
    setVersion(v => v + 1);
    const bits = [
      n.document_type,
      n.index_number ? 'index number ' + n.index_number : null,
      n.hearing_datetime ? 'hearing ' + n.hearing_datetime : null,
      n.arrears_usd != null ? 'arrears claimed $' + n.arrears_usd.toLocaleString() : null,
      n.landlord_or_petitioner ? 'petitioner ' + n.landlord_or_petitioner : null,
      n.date_served_or_dated ? 'dated ' + n.date_served_or_dated : null,
    ].filter(Boolean);
    send('Court notice read: ' + bits.join(', ') + '. She has the court index number. Update the case with these facts.');
  }

  const userTurns = msgs.filter(m => m.role === 'user').length;
  const top = draft.evidence ? topSetAside(draft.evidence) : null;
  const suggestion =
    userTurns === 1 && top ? `Why did you set aside ${top.id}? It looked like a strong match.` : GOLDEN[userTurns];

  // fromComposer: only what the paralegal typed or dictated gets the Spanish label,
  // never messages the app composes (notice summaries, suggestions, 'Tell Hearth').
  async function send(raw: string, fromComposer = false) {
    const text = raw.trim();
    if (!text || pending) return;
    const outgoing = fromComposer && lang === 'es-US' && !text.startsWith('[') ? `[Tenant, in Spanish]: ${text}` : text;
    setMsgs(m => [...m, {id: nextId.current++, role: 'user', text: outgoing}]);
    setValue('');
    setPending(true);
    if (!caseId) {
      const id = newCaseId();
      setCaseId(id);
      history.replaceState(null, '', `#case=${id}`);
    }
    const agentText = resumed ? `${resumePrimer(draft, block, hearingAt)}\n\n${outgoing}` : outgoing;
    setResumed(false);
    try {
      const res = await sendTurn(agentText);
      absorb(res.tools, res.text);
      if (res.tools.length) setVersion(v => v + 1);
      setMsgs(m => [...m, {id: nextId.current++, role: 'assistant', text: res.text, tools: res.tools}]);
      if (res.tools.some(t => t.name === 'finalize_brief')) {
        const md = await fetchBrief();
        if (md) {
          setBrief(md);
          if (!matchMedia('(min-width: 1100px)').matches) setBriefOpen(true);
        }
      }
    } catch (e) {
      setMsgs(m => [...m, {id: nextId.current++, role: 'error', text: (e as Error).message}]);
    } finally {
      setPending(false);
    }
  }

  // Pull structured state out of tool results so the brief can draft itself.
  function absorb(tools: ToolResult[], text: string) {
    setDraft(d => {
      const n: Draft = {...d, cantProve: [...d.cantProve]};
      for (const {name, response: r} of tools) {
        if (name === 'open_case' && r && (typeof r.hearing_ts === 'number' || typeof r.hours_to_hearing === 'number')) {
          setHearingAt(typeof r.hearing_ts === 'number' ? r.hearing_ts * 1000 : Date.now() + r.hours_to_hearing * 3600_000);
          if (r.hearing_iso) n.hearingIso = r.hearing_iso;
        }
        if (name === 'open_case' && r) {
          const a = tools.find(t => t.name === 'open_case')?.args;
          if (a?.hazards) n.hazards = a.hazards;
          if (a?.tenant_narrative) n.narrative = a.tenant_narrative;
          if (r.hearing) n.hearing = r.hearing;
          if (typeof r.hours_to_hearing === 'number') setHours(r.hours_to_hearing);
          setUrgent(String(r.urgency ?? '').toUpperCase().startsWith('EMERGENCY'));
        }
        if (name === 'update_case') {
          const a = tools.find(t => t.name === 'update_case')?.args ?? {};
          n.household = {...(n.household ?? {}), ...a};
        }
        if (name === 'search_habitability_evidence' && r?.kept) n.evidence = r as Evidence;
        if (name === 'match_statutes' && r?.statutes) n.statutes = r.statutes as Statute[];
        if (name === 'match_relief_funds' && r?.funds) n.funds = r.funds as Fund[];
        if (name === 'get_tract_context' && r?.census_tract_geoid) n.tract = r as Tract;
      }
      const m = text.match(/\*\*What the record can.t prove yet:\*\*\s*([\s\S]+)$/i);
      if (m) {
        for (const line of m[1].split('\n').map(s => s.replace(/^[*\-\s]+/, '').trim()).filter(Boolean)) {
          if (!n.cantProve.includes(line)) n.cantProve.push(line);
        }
      }
      return n;
    });
    const kept = tools.find(t => t.name === 'search_habitability_evidence')?.response?.kept?.[0];
    if (kept?.block_address) setBlock(String(kept.block_address).split(',')[0]);
  }

  const sectionsReady = useMemo(
    () => [draft.evidence, draft.statutes, draft.funds, draft.tract, brief].filter(Boolean).length,
    [draft, brief],
  );

  const composer = (
    <ChatComposer
      value={value}
      onChange={setValue}
      onSubmit={v => send(v, true)}
      isDisabled={pending}
      placeholder={lang === 'es-US' ? 'Dictate or type what the tenant said (Spanish)…' : 'Describe the situation, or ask Hearth…'}
      headerContext={
        suggestion && !pending && msgs.length > 0 ? (
          <button className="suggest" onClick={() => send(suggestion)}>
            <span className="suggest-label">Next</span> {suggestion}
          </button>
        ) : undefined
      }
      footerActions={
        <div className="composer-tools">
          <AttachButton
            onAttachment={addAttachment}
            onTranscript={t => setValue(v => (v ? v + '\n' + t : t))}
            onError={msg => setMsgs(m => [...m, {id: nextId.current++, role: 'error', text: msg}])}
          />
          <MicButton lang={lang} onText={t => setValue(v => (v ? `${v} ${t}` : t))} />
          <SegmentedControl value={lang} onChange={v => setLang(v as typeof lang)} label="Dictation language" size="sm">
            <SegmentedControlItem value="en-US" label="EN" />
            <SegmentedControlItem value="es-US" label="ES" />
          </SegmentedControl>
        </div>
      }
    />
  );

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <button className="cases-btn" onClick={() => setCasesOpen(true)} aria-label="My cases">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
            Cases
          </button>
          <HearthMark size={22} />
          <span className="brand-name">Hearth</span>
          <span className="brand-sub">Housing-court intake partner</span>
          {caseId && !IS_MOCK && (
            <span className={`save-state save-${saveState}`}>
              {saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Not saved' : saveState === 'saved' ? 'Saved' : ''}
            </span>
          )}
        </div>
        <div className="topbar-right">
          {hearingAt !== null && <span className="case-line">{block ?? 'Open case'}</span>}
          {hearingAt !== null && <HearingClock at={hearingAt} label={draft.hearing ?? null} />}
          {!wide && <Button
            label={`Brief ${sectionsReady}/5`}
            variant={brief ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setBriefOpen(true)}
          />}
        </div>
      </header>

      <div className="body">
      <main className="chat-wrap" hidden={wide && mode === 'brief'}>
        <ChatLayout composer={composer} density="balanced">
          {msgs.length === 0 && !pending ? (
            <div className="welcome">
              <EmptyState
                icon={<HearthMark size={44} />}
                title="New intake"
                description="Tell Hearth what the tenant said. Hearth searches NYC housing records by meaning, sets aside closed and commercial look-alikes, and drafts the attorney's brief as you talk."
                actions={<Button label="Start the Marisol intake" variant="primary" onClick={() => send(GOLDEN[0])} />}
              />
            </div>
          ) : (
          <ChatMessageList
          >
            {msgs.map(m =>
              m.role === 'user' ? (
                <ChatMessage key={m.id} sender="user">
                  <ChatMessageBubble>{m.text}</ChatMessageBubble>
                </ChatMessage>
              ) : m.role === 'attachment' ? (
                <ChatMessage key={m.id} sender="user">
                  <ChatMessageBubble variant="ghost" width="100%">
                    <AttachmentCard a={m.att} onTellHearth={send} onUseNotice={m.att.kind === 'notice' ? useNotice : undefined} />
                  </ChatMessageBubble>
                </ChatMessage>
              ) : m.role === 'error' ? (
                <ChatMessage key={m.id} sender="assistant" avatar={<HearthMark size={28} />}>
                  <ChatMessageBubble variant="ghost">
                    <Text color="secondary">⚠ {m.text}</Text>
                  </ChatMessageBubble>
                </ChatMessage>
              ) : (
                <AssistantMessage key={m.id} msg={m} onOpenBrief={() => (wide ? document.querySelector('.brief-panel-scroll')?.scrollTo({top: 0, behavior: 'smooth'}) : setBriefOpen(true))} />
              ),
            )}
            {pending && (
              <ChatMessage sender="assistant" avatar={<HearthMark size={28} />}>
                <ChatMessageBubble variant="ghost" name="Hearth">
                  <span className="working">
                    <Spinner size="sm" /> <Text color="secondary">{WORKING[workingIdx]}</Text>
                  </span>
                </ChatMessageBubble>
              </ChatMessage>
            )}
          </ChatMessageList>
          )}
        </ChatLayout>
      </main>
      {wide && mode === 'split' && (
        <div
          className="divider"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panels (double-click to reset)"
          tabIndex={0}
          onPointerDown={startDrag}
          onDoubleClick={() => setBriefW(520)}
          title="Drag to resize · double-click to reset"
          onKeyDown={e => {
            if (e.key === 'ArrowLeft') setBriefW(w => Math.min(w + 40, window.innerWidth - 420));
            if (e.key === 'ArrowRight') setBriefW(w => Math.max(w - 40, 340));
          }}
        >
          <span className="divider-grip" aria-hidden="true" />
        </div>
      )}
      {wide && mode !== 'chat' && (
        <BriefPanel draft={draft} brief={brief} block={block} hours={hours} edits={edits} mode={mode} onMode={setMode} width={briefW} />
      )}
      {wide && mode === 'chat' && (
        <button className="brief-rail" onClick={() => setMode('split')} aria-label="Show the brief">
          <span>Brief {sectionsReady}/5</span>
        </button>
      )}
      </div>

      {!wide && <BriefDrawer
        isOpen={briefOpen}
        onOpenChange={setBriefOpen}
        draft={draft}
        brief={brief}
        block={block}
        hours={hours}
        edits={edits}
      />}
      <Caseload isOpen={casesOpen} onOpenChange={setCasesOpen} currentId={caseId} onOpenCase={openCase} onNewCase={newCase} onDeleted={id => id === caseId && newCase()} />
      {IS_MOCK && <div className="mock-flag">Mock replay</div>}
    </div>
  );
}

function AssistantMessage({
  msg,
  onOpenBrief,
}: {
  msg: Extract<Msg, {role: 'assistant'}>;
  onOpenBrief: () => void;
}) {
  const evidence = msg.tools.find(t => t.name === 'search_habitability_evidence')?.response as Evidence | undefined;
  const funds = msg.tools.find(t => t.name === 'match_relief_funds')?.response?.funds as Fund[] | undefined;
  const wroteBrief = msg.tools.some(t => t.name === 'finalize_brief');
  const calls = msg.tools.map((t, i) => ({
    key: `${t.name}-${i}`,
    name: TOOL_LABELS[t.name] ?? t.name,
    status: 'complete' as const,
  }));
  return (
    <ChatMessage sender="assistant" avatar={<HearthMark size={28} />}>
      <ChatMessageBubble variant="ghost" name="Hearth" width="100%">
        <div className="reply">
          {calls.length > 0 && <ChatToolCalls calls={calls} label={`${calls.length} step${calls.length > 1 ? 's' : ''}`} />}
          {msg.text && <Markdown density="compact">{msg.text}</Markdown>}
          {msg.text && <ReadAloud text={msg.text} />}
          {evidence?.kept && <EvidenceBlock evidence={evidence} />}
          {funds && <FundsBlock funds={funds} />}
          {wroteBrief && (
            <div>
              <Button label="Open the brief" variant="primary" size="sm" onClick={onOpenBrief} />
            </div>
          )}
        </div>
      </ChatMessageBubble>
    </ChatMessage>
  );
}

/** Prominent, live countdown to the hearing, colored by urgency. */
function HearingClock({at, label}: {at: number; label: string | null}) {
  const left = Math.max(0, at - Date.now());
  const h = left / 3600_000;
  const level = h < 72 ? 'urgent' : h < 168 ? 'soon' : 'later';
  const days = Math.floor(h / 24);
  const rem = Math.floor(h % 24);
  const leftText = h < 1 ? 'less than 1 h left' : h < 48 ? `${Math.floor(h)} h left` : `${days} days ${rem} h left`;
  const when = label ? label.replace(/,?\s*\d{4}/, '').replace(/^(\w{3})\w*/, '$1') : null;
  return (
    <span className={`clock clock-${level}`} role="timer" aria-live="polite" title={label ?? ''}>
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2.5 2M9 2h6" />
      </svg>
      {when && <span className="clock-when">Hearing {when}</span>}
      <strong>{leftText}</strong>
      {level === 'urgent' && <span className="clock-tag">Urgent</span>}
    </span>
  );
}

/** New York local "YYYY-MM-DDTHH:MM" for a timestamp. */
function nyIso(ms: number) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'})
      .formatToParts(new Date(ms))
      .map(x => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Hidden context for the agent when a saved case is reopened in a new session. */
function resumePrimer(d: Draft, block: string | null, hearingAt: number | null) {
  const parts = [
    '[Note for Hearth, not from the tenant: this is a saved case reopened in a new session. Do not mention this note.',
    `First call open_case with block_address "${block ?? ''}", hearing_datetime "${d.hearingIso ?? (hearingAt ? nyIso(hearingAt) : '')}", hazards ${JSON.stringify(d.hazards ?? [])}, tenant_narrative ${JSON.stringify(d.narrative ?? '')}.`,
  ];
  if (d.household && Object.keys(d.household).length) parts.push(`Then call update_case with ${JSON.stringify(d.household)}.`);
  parts.push("Re-run other tools only if the paralegal's message needs them, then answer it.]");
  return parts.join(' ');
}

const SEVERITY = ['Class C', 'Class B', 'Class A'];

/** What gets stored in Firestore for one case (no tenant names or unit numbers). */
function buildCaseDoc(s: {msgs: Msg[]; draft: Draft; brief: string | null; block: string | null; hearingAt: number | null; editHtml: string | null}) {
  const kept = s.draft.evidence?.kept ?? [];
  const classes = kept.map(r => violationClass(r.raw_complaint_type ?? '')).filter(Boolean) as string[];
  const worst = SEVERITY.find(c => classes.includes(c));
  const eligible = (s.draft.funds ?? []).filter(f => f.status === 'ELIGIBLE');
  let nextAction = 'Finish intake';
  if (s.draft.evidence) {
    if (!s.brief) nextAction = eligible.length ? `Apply: ${eligible[0].program_name}; then draft the brief` : 'Draft the brief';
    else nextAction = s.draft.cantProve[0] ? `Confirm: ${s.draft.cantProve[0]}` : 'Attorney review';
  }
  return {
    title: s.block ?? 'Untitled intake',
    block: s.block,
    hearingAt: s.hearingAt,
    hearingLabel: s.draft.hearing ?? null,
    status: s.editHtml ? 'edited' : s.brief ? 'ready' : 'draft',
    edited: !!s.editHtml,
    worstHazard: worst ? `${HAZARD_CLASS[worst].label} (${HAZARD_CLASS[worst].deadline})` : null,
    nextAction: nextAction.length > 110 ? nextAction.slice(0, 107) + '…' : nextAction,
    recordCount: s.draft.evidence ? kept.length : null,
    eligibleFunds: s.draft.funds ? eligible.length : null,
    msgs: s.msgs,
    draft: s.draft,
    brief: s.brief,
    editHtml: s.editHtml,
  };
}
