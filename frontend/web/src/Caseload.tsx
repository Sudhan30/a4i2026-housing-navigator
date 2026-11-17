import {useEffect, useState} from 'react';
import {Drawer, DrawerHeader} from '@astryxdesign/core/Drawer';
import {Button} from '@astryxdesign/core/Button';
import {Badge} from '@astryxdesign/core/Badge';
import {Text} from '@astryxdesign/core/Text';
import {deleteCase, listCases, type CaseSummary} from './api';

function timeLeft(at?: number) {
  if (!at) return {text: 'No hearing date', level: 'later' as const};
  const h = (at - Date.now()) / 3600_000;
  if (h < 0) return {text: 'Hearing passed', level: 'past' as const};
  const level = h < 72 ? 'urgent' : h < 168 ? 'soon' : 'later';
  const text = h < 48 ? `${Math.floor(h)} h left` : `${Math.floor(h / 24)} days ${Math.floor(h % 24)} h left`;
  return {text, level} as const;
}

const STATUS: Record<string, {label: string; variant: 'neutral' | 'success' | 'info'}> = {
  draft: {label: 'Brief in progress', variant: 'neutral'},
  ready: {label: 'Brief ready', variant: 'success'},
  edited: {label: 'Edited by paralegal', variant: 'info'},
};

/** Action queue of saved cases, most urgent hearing first. Not analytics: each row is a next step. */
export function Caseload({
  isOpen,
  onOpenChange,
  currentId,
  onOpenCase,
  onNewCase,
  onDeleted,
}: {
  isOpen: boolean;
  onOpenChange: (o: boolean) => void;
  currentId: string | null;
  onOpenCase: (id: string) => void;
  onNewCase: () => void;
  onDeleted: (id: string) => void;
}) {
  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  async function remove(id: string) {
    try {
      await deleteCase(id);
      setCases(cs => (cs ?? []).filter(c => c.id !== id));
      setConfirming(null);
      onDeleted(id);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    setErr(null);
    listCases()
      .then(setCases)
      .catch(e => setErr((e as Error).message));
  }, [isOpen]);

  return (
    <Drawer isOpen={isOpen} onOpenChange={onOpenChange} side="start" width={440} label="My cases">
      <DrawerHeader title="My cases" subtitle="Most urgent hearing first" onOpenChange={onOpenChange} hasDivider />
      <div className="caseload">
        <Button label="+ New intake" variant="primary" size="sm" onClick={onNewCase} />
        {err && <Text color="secondary">⚠ {err}</Text>}
        {cases === null && !err && <Text color="secondary">Loading…</Text>}
        {cases?.length === 0 && <Text color="secondary">No saved cases yet. Cases save automatically as you work.</Text>}
        <ul className="case-list">
          {cases?.map(c => {
            const t = timeLeft(c.hearingAt);
            const st = STATUS[c.status ?? 'draft'] ?? STATUS.draft;
            return (
              <li key={c.id} className="case-item">
                <button className={`case-row ${c.id === currentId ? 'is-current' : ''}`} onClick={() => onOpenCase(c.id)}>
                  <span className="case-top">
                    <span className="case-block">{c.block ?? c.title ?? 'Untitled intake'}</span>
                    <span className={`case-clock clock-${t.level}`}>{t.text}</span>
                  </span>
                  <span className="case-meta">
                    {c.hearingLabel && <span>{c.hearingLabel}</span>}
                    {c.worstHazard && <span className="case-hazard">{c.worstHazard}</span>}
                    {c.recordCount != null && <span>{c.recordCount} records</span>}
                    {c.eligibleFunds != null && <span>{c.eligibleFunds} funds</span>}
                  </span>
                  {c.nextAction && (
                    <span className="case-next">
                      <span className="case-next-label">Next</span> {c.nextAction}
                    </span>
                  )}
                  <span className="case-foot">
                    <Badge variant={st.variant} label={st.label} />
                    {c.id === currentId && <span className="case-open-tag">Open now</span>}
                  </span>
                </button>
                {confirming === c.id ? (
                  <span className="case-confirm" role="alert">
                    Delete this case and its saved worksheet? This can’t be undone.
                    <span className="case-confirm-actions">
                      <Button label="Delete" variant="destructive" size="sm" onClick={() => remove(c.id)} />
                      <Button label="Cancel" variant="ghost" size="sm" onClick={() => setConfirming(null)} />
                    </span>
                  </span>
                ) : (
                  <button className="case-delete" onClick={() => setConfirming(c.id)} aria-label={`Delete case at ${c.block ?? 'untitled'}`}>
                    Delete
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <Text type="supporting" color="secondary">
          Saved in Google Firestore. Block-level addresses only; no tenant names or unit numbers.
        </Text>
      </div>
    </Drawer>
  );
}
