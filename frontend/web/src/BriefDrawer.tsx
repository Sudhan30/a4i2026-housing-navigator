import {useLayoutEffect, useRef, useState} from 'react';
import {Drawer, DrawerHeader} from '@astryxdesign/core/Drawer';
import {Button} from '@astryxdesign/core/Button';
import {Markdown} from '@astryxdesign/core/Markdown';
import {Text} from '@astryxdesign/core/Text';
import type {Evidence, Fund, Statute, Tract} from './api';
import {HAZARD_CLASS, hazardLabel, violationClass} from './Blocks';
import {CourtForm} from './CourtForm';
import {ReadAloud} from './Voice';

export type Draft = {
  photos?: {thumb: string; condition: string; observed: string; estimate: string; cannotProve: string[]}[];
  notice?: import('./api').NoticeResult;
  household?: Record<string, unknown>;
  hearingIso?: string;
  hazards?: string[];
  narrative?: string;
  hearing?: string;
  evidence?: Evidence;
  statutes?: Statute[];
  funds?: Fund[];
  tract?: Tract;
  cantProve: string[];
};

function draftMarkdown(d: Draft): string {
  const s: string[] = [];
  s.push('## 1. Corroborating records');
  s.push(
    d.evidence
      ? (d.evidence.kept ?? []).length
        ? (d.evidence.kept ?? [])
            .map(r => `- \`${r.request_id}\` · ${hazardLabel(r)} (${HAZARD_CLASS[violationClass(r.raw_complaint_type ?? '') ?? '']?.label ?? 'unclassified'}) · ${(r.block_address ?? '').split(',')[0]} · open since ${r.created_date}`)
            .join('\n') +
          `\n\n_${(d.evidence.excluded ?? []).length} look-alikes set aside by the rules._`
        : '_No open residential record near the block._'
      : '_Waiting for the record search…_',
  );
  s.push('## 2. Applicable law');
  s.push(
    d.statutes?.length
      ? d.statutes.map(x => `- **${x.code_citation}** · ${x.ordinance_title}`).join('\n')
      : '_Waiting for the legal question…_',
  );
  s.push('## 3. Relief funds');
  s.push(
    d.funds?.length
      ? d.funds
          .map(f => `- **${f.program_name}** · ${f.status === 'ELIGIBLE' ? 'Eligible' : f.status === 'INELIGIBLE' ? 'Not eligible' : 'Needs info'}${f.max_award_usd ? ` · up to $${f.max_award_usd.toLocaleString()}` : ''}`)
          .join('\n')
      : '_Waiting for household facts…_',
  );
  s.push('## 4. Neighborhood');
  s.push(
    d.tract
      ? `Tract ${d.tract.census_tract_geoid}: severe rent burden ${d.tract.severe_rent_burden_pct}%` +
          (d.tract.metro_severe_rent_burden_pct != null ? ` (city ${d.tract.metro_severe_rent_burden_pct}%)` : '') +
          ` · ${d.tract.annual_nonpayment_filings_modeled} nonpayment filings a year [Modeled]` +
          (d.tract.median_tract_nonpayment_filings_modeled != null ? ` (median ${d.tract.median_tract_nonpayment_filings_modeled})` : '') +
          (d.tract.no_vehicle_pct != null ? ` · ${d.tract.no_vehicle_pct}% of households without a car.` : '.')
      : '_Waiting for neighborhood context…_',
  );
  s.push("## 5. What the record can't prove yet");
  s.push(d.cantProve.length ? d.cantProve.map(x => `- ${x}`).join('\n') : '_Collected from the conversation as it goes._');
  return s.join('\n\n');
}

/** Human-in-the-loop edits to the worksheet, kept in App so they survive panel changes. */
export type BriefEdits = {
  html: string | null; // edited worksheet markup; null = show the live agent version
  editing: boolean;
  stale: boolean; // agent produced new information after the paralegal started editing
  start: (html: string) => void;
  save: (html: string) => void;
  discard: () => void;
  keep: () => void;
};

type BriefProps = {draft: Draft; brief: string | null; block: string | null; hours: number | null; edits: BriefEdits};

function BriefBody({draft, brief, block, hours, edits}: BriefProps) {
  const live = useRef<HTMLDivElement>(null);
  const editor = useRef<HTMLDivElement>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const showingEdits = edits.html !== null;

  // Load the snapshot into the editable surface once per edit session (not on every render).
  useLayoutEffect(() => {
    if (editor.current && edits.html !== null && editor.current.dataset.loaded !== edits.html.length.toString()) {
      editor.current.innerHTML = edits.html;
      editor.current.dataset.loaded = edits.html.length.toString();
    }
  }, [edits.html]);

  const currentNode = () => (showingEdits ? editor.current : live.current)?.querySelector('.cf') ?? (showingEdits ? editor.current : live.current);

  function toggleBox(e: React.MouseEvent) {
    if (!edits.editing) return;
    const box = (e.target as HTMLElement).closest('.cf-box');
    if (!box) return;
    e.preventDefault();
    const on = box.classList.toggle('on');
    box.textContent = on ? '✕' : '';
    box.setAttribute('aria-label', on ? 'checked' : 'unchecked');
  }

  async function downloadPdf() {
    const node = currentNode() as HTMLElement | null;
    if (!node) return;
    setPdfBusy(true);
    try {
      const {buildFillablePdf} = await import('./fillablePdf');
      const bytes = await buildFillablePdf(node);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], {type: 'application/pdf'}));
      const a = Object.assign(document.createElement('a'), {href: url, download: 'tenant_stabilization_worksheet.pdf'});
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } finally {
      setPdfBusy(false);
    }
  }

  const summaryText = () => {
    const kept = draft.evidence?.kept ?? [];
    const parts = [
      block ? 'Case at ' + block + '.' : '',
      hours != null ? 'Hearing in about ' + Math.round(hours) + ' hours.' : '',
      kept.length ? kept.length + ' open violations on record: ' + kept.map(r => hazardLabel(r)).join(', ') + '.' : '',
      draft.funds ? 'Eligible for ' + draft.funds.filter(f => f.status === 'ELIGIBLE').length + ' of ' + draft.funds.length + ' relief funds.' : '',
      draft.cantProve.length ? 'Still to confirm: ' + draft.cantProve.slice(0, 2).join(' ') : '',
    ];
    return parts.filter(Boolean).join(' ') || 'No case details yet.';
  };
  const text = () => (currentNode() as HTMLElement | null)?.innerText ?? (brief ?? draftMarkdown(draft));

  return (
    <div className="brief">
      <div className="brief-actions brief-toolbar">
        {edits.editing ? (
          <Button label="Done editing" variant="primary" size="sm" onClick={() => edits.save(editor.current?.innerHTML ?? '')} />
        ) : (
          <Button
            label={showingEdits ? 'Edit again' : 'Edit'}
            variant="secondary"
            size="sm"
            onClick={() => edits.start(showingEdits ? editor.current?.innerHTML ?? '' : live.current?.innerHTML ?? '')}
          />
        )}
        <Button label={pdfBusy ? 'Preparing PDF…' : 'Download fillable PDF'} variant="secondary" size="sm" isDisabled={pdfBusy || edits.editing} onClick={downloadPdf} />
        <ReadAloud text={summaryText()} label="Read summary" />
        <Button label="Copy text" variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(text())} />
        {showingEdits && !edits.editing && <Button label="Discard edits" variant="ghost" size="sm" onClick={edits.discard} />}
      </div>
      {edits.stale && (
        <div className="edit-banner" role="status">
          <span>Hearth has new information since you started editing.</span>
          <span className="edit-banner-actions">
            <Button label="Use updated version" variant="secondary" size="sm" onClick={edits.discard} />
            <Button label="Keep my edits" variant="ghost" size="sm" onClick={edits.keep} />
          </span>
        </div>
      )}
      {showingEdits && !edits.editing && !edits.stale && (
        <div className="edit-note">Edited by paralegal · this version is what gets downloaded</div>
      )}

      <div ref={live} hidden={showingEdits}>
        <CourtForm draft={draft} brief={brief} block={block} hearing={draft.hearing ?? null} hours={hours} />
      </div>
      {showingEdits && (
        <div
          ref={editor}
          className={`cf-editor ${edits.editing ? 'is-editing' : ''}`}
          contentEditable={edits.editing}
          suppressContentEditableWarning
          spellCheck={edits.editing}
          onClick={toggleBox}
          aria-label="Editable worksheet"
        />
      )}

    </div>
  );
}

/** Always-visible panel beside the chat on wide screens. */
export type PanelMode = 'split' | 'chat' | 'brief';

export function BriefPanel({
  mode,
  onMode,
  width,
  ...props
}: BriefProps & {mode: PanelMode; onMode: (m: PanelMode) => void; width: number}) {
  return (
    <aside
      className="brief-panel"
      aria-label="Tenant Stabilization Brief"
      style={mode === 'brief' ? {width: '100%'} : {width}}
    >
      <div className="brief-panel-head">
        <span className="brief-title">
          Tenant Stabilization Brief
          <span className={`brief-state ${props.brief ? 'is-final' : ''}`}>
            {props.brief ? 'Final' : 'Drafting as you talk'}
          </span>
        </span>
        <span className="panel-buttons">
          {mode === 'split' ? (
            <>
              <Button label="Expand" variant="ghost" size="sm" onClick={() => onMode('brief')} />
              <Button label="Hide" variant="ghost" size="sm" onClick={() => onMode('chat')} />
            </>
          ) : (
            <Button label="Show chat" variant="ghost" size="sm" onClick={() => onMode('split')} />
          )}
        </span>
      </div>
      <div className="brief-panel-scroll">
        <BriefBody {...props} />
      </div>
    </aside>
  );
}

/** Slide-out version for narrow screens. */
export function BriefDrawer({isOpen, onOpenChange, ...props}: BriefProps & {isOpen: boolean; onOpenChange: (o: boolean) => void}) {
  return (
    <Drawer isOpen={isOpen} onOpenChange={onOpenChange} side="end" width={680} label="Tenant Stabilization Brief" padding={0}>
      <DrawerHeader
        title="Tenant Stabilization Brief"
        subtitle={props.brief ? 'Final · ready for attorney review' : 'Draft · fills in as you talk'}
        onOpenChange={onOpenChange}
        hasDivider
      />
      <BriefBody {...props} />
    </Drawer>
  );
}
