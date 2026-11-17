import {Drawer, DrawerHeader} from '@astryxdesign/core/Drawer';
import {Button} from '@astryxdesign/core/Button';
import {Markdown} from '@astryxdesign/core/Markdown';
import {Text} from '@astryxdesign/core/Text';
import type {Evidence, Fund, Statute, Tract} from './api';
import {hazardLabel, violationClass} from './Blocks';

export type Draft = {
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
            .map(r => `- \`${r.request_id}\` · ${violationClass(r.raw_complaint_type ?? '') ?? ''} ${hazardLabel(r)} · ${(r.block_address ?? '').split(',')[0]} · open since ${r.created_date}`)
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

type BriefProps = {draft: Draft; brief: string | null; block: string | null; hours: number | null};

function BriefBody({draft, brief, block, hours}: BriefProps) {
  const md = brief ?? draftMarkdown(draft);
  const download = () => {
    const url = URL.createObjectURL(new Blob([md], {type: 'text/markdown'}));
    const a = Object.assign(document.createElement('a'), {href: url, download: 'tenant_stabilization_brief.md'});
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="brief">
      <Text type="supporting" color="secondary">
        {block ?? 'No case open yet'}
        {hours !== null ? ` · hearing in ${Math.round(hours)} h` : ''}
      </Text>
      <article className="paper" key={md.length}>
        <Markdown>{md}</Markdown>
      </article>
      <div className="brief-actions">
        <Button label="Copy" variant="secondary" size="sm" onClick={() => navigator.clipboard.writeText(md)} />
        <Button label="Download .md" variant="secondary" size="sm" onClick={download} />
        <Button label="Print" variant="ghost" size="sm" onClick={() => window.print()} />
      </div>
      <Text type="supporting" color="secondary">
        Real: ACS 5-year, NYC HPD/311 · Modeled: eviction filings · Internal triage aid, not legal advice.
      </Text>
    </div>
  );
}

/** Always-visible panel beside the chat on wide screens. */
export function BriefPanel(props: BriefProps) {
  return (
    <aside className="brief-panel" aria-label="Tenant Stabilization Brief">
      <div className="brief-panel-head">
        <span className="brief-title">Tenant Stabilization Brief</span>
        <span className={`brief-state ${props.brief ? 'is-final' : ''}`}>
          {props.brief ? 'Final' : 'Drafting as you talk'}
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
