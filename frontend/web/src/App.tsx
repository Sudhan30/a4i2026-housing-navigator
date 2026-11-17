import {useEffect, useMemo, useRef, useState} from 'react';
import {
  ChatComposer,
  ChatDictationButton,
  ChatLayout,
  ChatMessage,
  ChatMessageBubble,
  ChatMessageList,
  ChatToolCalls,
  useSpeechRecognition,
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
  type Evidence,
  type Fund,
  type Statute,
  type Tract,
  type ToolResult,
} from './api';
import {EvidenceBlock, FundsBlock} from './Blocks';
import {BriefDrawer, BriefPanel, type Draft} from './BriefDrawer';
import {HearthMark} from './HearthMark';

type Msg =
  | {id: number; role: 'user'; text: string}
  | {id: number; role: 'assistant'; text: string; tools: ToolResult[]}
  | {id: number; role: 'error'; text: string};

const GOLDEN = [
  "New intake. Tenant on the 1000 block of St. Nicholas Ave, Manhattan. Nonpayment hearing Monday 9:30. Radiators cold since early Nov, black mold around the tub, water coming through the bathroom wall. Anything open on her block?",
  'Why did you drop the #2 result? It looked like a strong match.',
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
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [pending, setPending] = useState(false);
  const [workingIdx, setWorkingIdx] = useState(0);
  const [value, setValue] = useState('');
  const [lang, setLang] = useState<'en-US' | 'es-US'>('en-US');
  const [hours, setHours] = useState<number | null>(null);
  const [urgent, setUrgent] = useState(false);
  const [block, setBlock] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({cantProve: []});
  const [brief, setBrief] = useState<string | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);
  const nextId = useRef(1);

  const dictation = useSpeechRecognition({
    lang,
    onResult: t => setValue(v => (v ? `${v} ${t}` : t)),
  });

  useEffect(() => {
    if (!pending) return;
    setWorkingIdx(0);
    const t = setInterval(() => setWorkingIdx(i => Math.min(i + 1, WORKING.length - 1)), 3500);
    return () => clearInterval(t);
  }, [pending]);

  const userTurns = msgs.filter(m => m.role === 'user').length;
  const suggestion = GOLDEN[userTurns];

  async function send(raw: string) {
    const text = raw.trim();
    if (!text || pending) return;
    const outgoing = lang === 'es-US' && !text.startsWith('[') ? `[Tenant, in Spanish]: ${text}` : text;
    setMsgs(m => [...m, {id: nextId.current++, role: 'user', text: outgoing}]);
    setValue('');
    setPending(true);
    try {
      const res = await sendTurn(outgoing);
      absorb(res.tools, res.text);
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
        if (name === 'open_case' && r) {
          if (typeof r.hours_to_hearing === 'number') setHours(r.hours_to_hearing);
          setUrgent(String(r.urgency ?? '').toUpperCase().startsWith('EMERGENCY'));
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
      onSubmit={send}
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
          <ChatDictationButton dictation={dictation} isHiddenWhenUnsupported label="Dictate" />
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
          <HearthMark size={22} />
          <span className="brand-name">Hearth</span>
          <span className="brand-sub">Housing-court intake partner</span>
        </div>
        <div className="topbar-right">
          {hours !== null && (
            <span className={`case-line ${urgent ? 'is-urgent' : ''}`}>
              {block ?? 'Open case'} · hearing in {Math.round(hours)} h
            </span>
          )}
          {!wide && <Button
            label={`Brief ${sectionsReady}/5`}
            variant={brief ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setBriefOpen(true)}
          />}
        </div>
      </header>

      <div className="body">
      <main className="chat-wrap">
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
      {wide && <BriefPanel draft={draft} brief={brief} block={block} hours={hours} />}
      </div>

      {!wide && <BriefDrawer
        isOpen={briefOpen}
        onOpenChange={setBriefOpen}
        draft={draft}
        brief={brief}
        block={block}
        hours={hours}
      />}
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
