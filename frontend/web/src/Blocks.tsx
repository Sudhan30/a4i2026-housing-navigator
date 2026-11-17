import {Badge} from '@astryxdesign/core/Badge';
import {Collapsible} from '@astryxdesign/core/Collapsible';
import {Text} from '@astryxdesign/core/Text';
import type {Evidence, Fund, Record311} from './api';
import {RecordsMap} from './RecordsMap';
import {HAZARD_CLASS, violationClass} from './hazards';
export {HAZARD_CLASS, violationClass} from './hazards';


const HAZARDS: [RegExp, string][] = [
  [/HEATING|BOILER|RADIATOR|\bHEAT\b/i, 'Heating system'],
  [/HOT WATER/i, 'No hot water'],
  [/MOLD/i, 'Mold'],
  [/LEAK/i, 'Water leak'],
  [/ELECTRIC|OUTLET|WIRING/i, 'Electrical'],
  [/WATERCLOSET|CLOGGED|SEWAGE|SEWER/i, 'Plumbing / sewage'],
  [/ROACH|MICE|RODENT|PEST/i, 'Pests'],
];
export function hazardLabel(r: Pick<Record311, 'complaint_narrative' | 'raw_complaint_type'>): string {
  const text = `${r.complaint_narrative ?? ''} ${r.raw_complaint_type ?? ''}`;
  return HAZARDS.find(([re]) => re.test(text))?.[1] ?? 'Housing complaint';
}

function shortBlock(b: string) {
  return b.split(',')[0].replace(/ Block /, ' block ');
}
function shortDate(d: string) {
  const dt = new Date(`${d}T12:00:00`);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
}

export function EvidenceBlock({evidence}: {evidence: Evidence}) {
  const kept = evidence.kept ?? [];
  const excluded = evidence.excluded ?? [];
  const raw = evidence.raw_top5_before_rules ?? [];
  const decoys = excluded.filter(e => e.request_id.startsWith('DECOY-')).length;
  return (
    <section className="block">
      <div className="block-head">
        <Text type="label">On the record</Text>
        <Text type="supporting" color="secondary">
          {kept.length} open · residential · near the block
        </Text>
      </div>

      {evidence.map?.anchor && <RecordsMap view={evidence.map} kept={kept} excluded={excluded} />}

      {kept.length === 0 ? (
        <Text color="secondary">No open residential record nearby. This may be under-reporting, not absence.</Text>
      ) : (
        <ul className="rows">
          {kept.map(r => (
            <li key={r.request_id}>
              <Collapsible
                defaultIsOpen={false}
                trigger={
                  <span className="row">
                    <span className="row-main">
                      <span className="row-title">{hazardLabel(r)}</span>
                      <span className="row-meta">
                        <code>{r.request_id}</code> · {shortBlock(r.block_address ?? '')}{r.created_date ? ` · open since ${shortDate(r.created_date)}` : ''}
                      </span>
                    </span>
                    {(() => {
                      const c = HAZARD_CLASS[violationClass(r.raw_complaint_type ?? '') ?? ''];
                      return c ? (
                        <span className="hz">
                          <Badge variant={c.variant} label={c.label} />
                          <span className="hz-deadline">{c.deadline}</span>
                        </span>
                      ) : null;
                    })()}
                  </span>
                }
              >
                <p className="narrative">{r.complaint_narrative}</p>
                <Text type="supporting" color="secondary">
                  Similarity {Number(r.similarity ?? 0).toFixed(2)} · {r.inspection_status}
                </Text>
              </Collapsible>
            </li>
          ))}
        </ul>
      )}

      {(() => {
        const top = topSetAside(evidence);
        return top ? (
          <p className="callout">
            Search ranked <code className="struck">{top.id}</code> #{top.rank} by meaning, but the rules set it aside:{' '}
            <strong>{shortReason(top.reason).toLowerCase()}</strong>.
          </p>
        ) : null;
      })()}

      {kept.length > 0 && (
        <a className="apply" href="https://hpdonline.nyc.gov/hpdonline/" target="_blank" rel="noreferrer">
          Confirm the tenant’s own building in HPD Online →
        </a>
      )}

      {excluded.length > 0 && (
        <Collapsible
                defaultIsOpen={false}
          trigger={
            <Text type="supporting" color="secondary">
              {excluded.length} look-alikes set aside{decoys ? ` (${decoys} planted decoys)` : ''}
            </Text>
          }
        >
          <ul className="rows rows-muted">
            {excluded.map(r => (
              <li key={r.request_id} className="row-static">
                <code className="struck">{r.request_id}</code>
                <span className="reason" title={r.excluded_because}>{shortReason(r.excluded_because)}</span>
                {r.request_id.startsWith('DECOY-') && <Badge variant="neutral" label="planted decoy" />}
              </li>
            ))}
          </ul>
        </Collapsible>
      )}

      {raw.length > 0 && (
        <Collapsible
                defaultIsOpen={false}
          trigger={
            <Text type="supporting" color="secondary">
              How search ranked them before the rules
            </Text>
          }
        >
          <ol className="ranking">
            {raw.map(c => {
              const kept_ = kept.some(k => k.request_id === c.request_id);
              return (
                <li key={c.request_id}>
                  <code className={kept_ ? '' : 'struck'}>{c.request_id}</code>
                  <span className="reason">
                    {Number(c.similarity ?? 0).toFixed(2)} · {c.status}
                    {kept_ ? '' : ' · set aside'}
                  </span>
                </li>
              );
            })}
          </ol>
        </Collapsible>
      )}
    </section>
  );
}

const STATUS_VARIANT = {ELIGIBLE: 'success', INELIGIBLE: 'error', 'NEEDS INFO': 'warning'} as const;
const STATUS_LABEL = {ELIGIBLE: 'Eligible', INELIGIBLE: 'Not eligible', 'NEEDS INFO': 'Needs info'} as const;

export function FundsBlock({funds}: {funds: Fund[]}) {
  const eligible = funds.filter(f => f.status === 'ELIGIBLE').length;
  return (
    <section className="block">
      <div className="block-head">
        <Text type="label">Relief funds</Text>
        <Text type="supporting" color="secondary">
          {eligible} of {funds.length} eligible · checked by rules
        </Text>
      </div>
      <ul className="rows">
        {funds.map(f => (
          <li key={f.bulletin_id}>
            <Collapsible
                defaultIsOpen={false}
              trigger={
                <span className="row">
                  <span className="row-main">
                    <span className="row-title">{shortProgram(f.program_name)}</span>
                    <span className="row-meta">
                      {f.max_award_usd ? `Up to $${f.max_award_usd.toLocaleString()} · ` : ''}
                      {f.administering_agency}
                    </span>
                  </span>
                  <Badge variant={STATUS_VARIANT[f.status] ?? 'neutral'} label={STATUS_LABEL[f.status] ?? f.status} />
                </span>
              }
            >
              <ul className="checks">
                {(f.checks ?? []).map((c, i) => (
                  <li key={i}>
                    <span className={c.pass === true ? 'ok' : c.pass === false ? 'bad' : 'warn'}>
                      {c.pass === true ? '✓' : c.pass === false ? '✗' : '?'}
                    </span>{' '}
                    <span>
                      <strong>{c.rule}</strong> · {c.detail}
                    </span>
                  </li>
                ))}
              </ul>
              {f.intake_url && (
                <a className="apply" href={f.intake_url} target="_blank" rel="noreferrer">
                  Apply at {f.intake_url.replace(/^https?:\/\//, '')} →
                </a>
              )}
            </Collapsible>
          </li>
        ))}
      </ul>
    </section>
  );
}

function shortProgram(name: string) {
  return name
    .replace(/^NYC Human Resources Administration Emergency Assistance \((.+)\)$/, '$1 (HRA)')
    .replace(/^NYC Local Law 136 /, '')
    .replace(/ & Housing Court Arrears Pathway$/, '');
}

export function shortReason(reason = ''): string {
  if (/radius/i.test(reason)) return 'Outside 800 m of the block';
  if (/commercial/i.test(reason)) return 'Commercial property, no tenants';
  if (/abated/i.test(reason)) return 'Already fixed and re-inspected';
  if (/no violation/i.test(reason)) return 'Inspector found no violation';
  if (/similarity/i.test(reason)) return 'Different hazard';
  if (/closed/i.test(reason)) return 'Case closed';
  return reason;
}

/** The highest-ranked candidate the rules set aside (what a judge should see). */
export function topSetAside(evidence: Evidence): {id: string; rank: number; reason: string} | null {
  const kept = new Set((evidence.kept ?? []).map(k => k.request_id));
  const excluded = evidence.excluded ?? [];
  const raw = evidence.raw_top5_before_rules ?? [];
  const hit = raw.find(c => !kept.has(c.request_id));
  if (hit) {
    const ex = excluded.find(e => e.request_id === hit.request_id);
    return {id: hit.request_id, rank: hit.rank, reason: ex?.excluded_because ?? hit.status};
  }
  return null;
}
