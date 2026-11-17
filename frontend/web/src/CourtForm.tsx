import {Markdown} from '@astryxdesign/core/Markdown';
import type {Draft} from './BriefDrawer';
import {HAZARD_CLASS, hazardLabel, shortReason, violationClass} from './Blocks';

/**
 * A court-paper style worksheet the paralegal hands to the supervising attorney.
 * It is an internal intake document, labeled as such, not an actual court filing.
 */

const CONDITIONS: [string, RegExp][] = [
  ['No heat / hot water', /heat|radiator|boiler|hot water|cold/i],
  ['Mold', /mold|moho/i],
  ['Water leak', /leak|water|agua/i],
  ['Electrical hazard', /electric|outlet|wiring|breaker|fuse/i],
  ['Sewage / plumbing', /sewage|sewer|toilet|clog|plumb/i],
  ['Pests', /roach|mice|rat|rodent|pest/i],
];

const LAW_URL: Record<string, string> = {
  'RPL § 235-b': 'https://www.nysenate.gov/legislation/laws/RPP/235-B',
  'SSL § 143-b': 'https://www.nysenate.gov/legislation/laws/SOS/143-B',
  'RPAPL § 711(2)': 'https://www.nysenate.gov/legislation/laws/RPA/711',
};
const DEFENSES: [string, string, RegExp][] = [
  ['Warranty of habitability; rent abatement', 'RPL § 235-b', /235-b/],
  ['Landlord repair deadlines (immediately hazardous: 24 h; hazardous: 30 days)', 'NYC Admin. Code § 27-2115', /27-2115/],
  ['Complete defense while rent-impairing violations persist (Spiegel)', 'SSL § 143-b', /143-b/],
  ['Right to counsel', 'NYC Admin. Code § 26-1302', /26-1302/],
  ['Landlord served the 14-day written rent demand (prerequisite; confirm with tenant)', 'RPAPL § 711(2)', /$^/],
];

function Box({checked}: {checked: boolean | null}) {
  return <span className={`cf-box ${checked ? 'on' : ''}`} aria-label={checked ? 'checked' : 'unchecked'}>{checked ? '✕' : ''}</span>;
}
function Blank({value, wide}: {value?: string | null; wide?: boolean}) {
  return <span className={`cf-blank ${wide ? 'wide' : ''} ${value ? 'filled' : ''}`}>{value || ' '}</span>;
}

/** Pull "## 6 … memo" and "## 7 … equity" out of the agent's final markdown, if present. */
function section(md: string | null, n: number): string | null {
  if (!md) return null;
  const start = md.search(new RegExp(`^##\\s*${n}\\.`, 'm'));
  if (start < 0) return null;
  const body = md.slice(md.indexOf('\n', start) + 1);
  const next = body.search(new RegExp(`^##\\s*${n + 1}\\.`, 'm'));
  return (next < 0 ? body : body.slice(0, next)).trim();
}

export function CourtForm({
  draft,
  brief,
  block,
  hearing,
  hours,
}: {
  draft: Draft;
  brief: string | null;
  block: string | null;
  hearing: string | null;
  hours: number | null;
}) {
  const hazardsText = (draft.hazards ?? []).join(' ') + ' ' + (draft.narrative ?? '');
  const kept = draft.evidence?.kept ?? [];
  const excluded = draft.evidence?.excluded ?? [];
  const cites = (draft.statutes ?? []).map(s => s.code_citation).join(' ');
  const memo = section(brief, 6);
  const equity = section(brief, 7);
  const today = new Date().toLocaleDateString('en-US', {month: 'long', day: 'numeric', year: 'numeric'});

  return (
    <div className="cf" role="document" aria-label="Tenant stabilization worksheet">
      <div className={`cf-stamp ${brief ? 'ready' : ''}`}>{brief ? 'Ready for review' : 'Draft'}</div>

      <header className="cf-court">
        <div>CIVIL COURT OF THE CITY OF NEW YORK</div>
        <div>COUNTY OF NEW YORK · HOUSING PART</div>
      </header>

      <div className="cf-caption">
        <div className="cf-parties">
          <p><Blank value={draft.notice?.landlord_or_petitioner || "Landlord of record"} wide />,</p>
          <p className="cf-role">Petitioner,</p>
          <p className="cf-against">— against —</p>
          <p><Blank value="Tenant (name withheld)" wide />,</p>
          <p className="cf-role">Respondent.</p>
        </div>
        <div className="cf-meta">
          <p>Index No. L&amp;T <Blank value={draft.notice?.index_number ?? null} /></p>
          <p>Calendar: <Blank value={hearing} wide /></p>
          <p>Premises: <Blank value={block} wide /></p>
          <p>Time remaining: <Blank value={hours != null ? `${Math.round(hours)} hours` : null} /></p>
        </div>
      </div>

      <h2 className="cf-title">
        HABITABILITY CORROBORATION &amp; STABILIZATION REFERRAL
        <small>Pre-calendar intake worksheet · prepared for the supervising attorney</small>
      </h2>

      <section className="cf-sec">
        <h3>1. Conditions reported by tenant</h3>
        <div className="cf-checks">
          {CONDITIONS.map(([label, re]) => (
            <label key={label}><Box checked={draft.hazards ? re.test(hazardsText) : false} /> {label}</label>
          ))}
        </div>
      </section>

      <section className="cf-sec">
        <h3>2. Official violations on record (NYC HPD / 311, open, residential, within 800 m)</h3>
        {draft.evidence ? (
          kept.length ? (
            <table className="cf-table">
              <thead>
                <tr><th>Hazard (HPD class)</th><th>Condition</th><th>Record no.</th><th>Location</th><th>Open since</th></tr>
              </thead>
              <tbody>
                {kept.map(r => (
                  <tr key={r.request_id}>
                    <td className="cf-class">
                      {(() => {
                        const k = violationClass(r.raw_complaint_type ?? '') ?? '';
                        const c = HAZARD_CLASS[k];
                        return c ? `${c.label} (${k.replace('Class ', '')}) · ${c.deadline}` : '—';
                      })()}
                    </td>
                    <td>{hazardLabel(r)}</td>
                    <td className="cf-mono">{r.request_id}</td>
                    <td>{(r.block_address ?? '').split(',')[0]}</td>
                    <td>{r.created_date ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="cf-note">No open residential violation found near the premises. Possible under-reporting: refer for HPD inspection.</p>
          )
        ) : (
          <p className="cf-pending">Pending record search…</p>
        )}
        {excluded.length > 0 && (
          <p className="cf-note">
            {excluded.length} similar records were reviewed and not relied on
            {(() => {
              const why = [...new Set(excluded.map(e => shortReason(e.excluded_because).toLowerCase()).filter(Boolean))];
              return why.length ? ` (${why.join('; ')})` : '';
            })()}.
          </p>
        )}
      </section>

      {(draft.photos?.length ?? 0) > 0 && (
        <section className="cf-sec">
          <h3>2a. Tenant-provided evidence (photos; visual review, not an HPD finding)</h3>
          <div className="cf-photos">
            {draft.photos!.map((ph, i) => (
              <div key={i} className="cf-photo">
                <img src={ph.thumb} alt={ph.condition} />
                <p><strong>{ph.condition}</strong> — {ph.observed} <em>Visual estimate: {ph.estimate}.</em></p>
              </div>
            ))}
          </div>
          <p className="cf-note">Photos need the tenant’s statement of date and location to be used as evidence.</p>
        </section>
      )}

      <section className="cf-sec">
        <h3>3. Defenses and claims indicated</h3>
        {draft.statutes ? (
          <ul className="cf-list">
            {DEFENSES.map(([label, cite, re]) => (
              <li key={cite}><Box checked={re.test(cites)} /> {label}{' '}{LAW_URL[cite] ? <a className="cf-cite" href={LAW_URL[cite]} target="_blank" rel="noreferrer">{cite}</a> : <span className="cf-cite">{cite}</span>}</li>
            ))}
          </ul>
        ) : (
          <p className="cf-pending">Pending legal review…</p>
        )}
      </section>

      <section className="cf-sec">
        <h3>4. Emergency relief referrals</h3>
        {draft.funds ? (
          <table className="cf-table">
            <thead>
              <tr><th></th><th>Program</th><th>Max award</th><th>Determination</th></tr>
            </thead>
            <tbody>
              {draft.funds.map(f => (
                <tr key={f.bulletin_id}>
                  <td><Box checked={f.status === 'ELIGIBLE'} /></td>
                  <td>{f.program_name}</td>
                  <td>{f.max_award_usd ? `$${f.max_award_usd.toLocaleString()}` : '—'}</td>
                  <td>{f.status === 'ELIGIBLE' ? 'Eligible' : f.status === 'INELIGIBLE' ? 'Not eligible' : 'Needs information'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="cf-pending">Pending household facts…</p>
        )}
      </section>

      <section className="cf-sec">
        <h3>5. Neighborhood context</h3>
        {draft.tract ? (
          <p>
            Census tract {draft.tract.census_tract_geoid}: {draft.tract.severe_rent_burden_pct}% of renter households pay
            half or more of income in rent
            {draft.tract.metro_severe_rent_burden_pct != null && <> (city: {draft.tract.metro_severe_rent_burden_pct}%)</>};{' '}
            {draft.tract.annual_nonpayment_filings_modeled} nonpayment filings per year <em>[modeled]</em>
            {draft.tract.median_tract_nonpayment_filings_modeled != null && <> (median tract: {draft.tract.median_tract_nonpayment_filings_modeled})</>}
            {draft.tract.no_vehicle_pct != null && <>; {draft.tract.no_vehicle_pct}% of households have no car</>}.
          </p>
        ) : (
          <p className="cf-pending">Pending neighborhood context…</p>
        )}
      </section>

      <section className="cf-sec">
        <h3>6. To confirm before calendar call</h3>
        <ul className="cf-list">
          {(draft.cantProve.length ? draft.cantProve : ['Violations are in the tenant’s own building or unit', '14-day written rent demand was served']).map(c => (
            <li key={c}><Box checked={false} /> {c}</li>
          ))}
        </ul>
      </section>

      {memo && (
        <section className="cf-sec">
          <h3>7. Intake memorandum</h3>
          <div className="cf-memo"><Markdown>{memo.replace(/^#\s.*$/m, '').replace(/^#{1,3}\s/gm, '#### ').trim()}</Markdown></div>
        </section>
      )}
      {equity && (
        <section className="cf-sec cf-equity">
          <h3>Equity audit (generated after the brief; not used in any eligibility decision)</h3>
          <Markdown>{equity}</Markdown>
        </section>
      )}

      <div className="cf-sign">
        <div><span className="cf-line" />Prepared by (intake paralegal)<span className="cf-date">Date: {today}</span></div>
        <div><span className="cf-line" />Reviewed by (supervising attorney)<span className="cf-date">Date:</span></div>
      </div>

      <footer className="cf-foot">
        Internal legal-aid worksheet, not a court filing. Sources: NYC HPD/311 open data and US Census ACS (real);
        eviction filing counts are modeled. Prepared with AI assistance; attorney review required.
      </footer>
    </div>
  );
}
