import {useRef, useState} from 'react';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {Text} from '@astryxdesign/core/Text';
import {inspectPhoto, prepareImage, readNotice, transcribeFile, type NoticeResult, type PhotoResult} from './api';

export type Attachment =
  | {kind: 'photo'; name: string; thumb: string; result: PhotoResult}
  | {kind: 'notice'; name: string; thumb?: string; result: NoticeResult};

const PaperclipIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 11.5 12.5 20a5.5 5.5 0 0 1-7.8-7.8l8.5-8.5a3.7 3.7 0 0 1 5.2 5.2l-8.5 8.5a1.8 1.8 0 0 1-2.6-2.6L15 7" />
  </svg>
);

/** Composer menu: photo of a condition, court notice, or an audio recording. */
export function AttachButton({
  onAttachment,
  onTranscript,
  onError,
}: {
  onAttachment: (a: Attachment) => void;
  onTranscript: (t: string) => void;
  onError: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const photo = useRef<HTMLInputElement>(null);
  const notice = useRef<HTMLInputElement>(null);
  const audio = useRef<HTMLInputElement>(null);

  async function run(label: string, fn: () => Promise<void>) {
    setOpen(false);
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const onPhoto = (f: File) =>
    run('Inspecting photo…', async () => {
      const {upload, thumb} = await prepareImage(f);
      onAttachment({kind: 'photo', name: f.name, thumb, result: await inspectPhoto(upload, 'image/jpeg')});
    });
  const onNotice = (f: File) =>
    run('Reading notice…', async () => {
      if (f.type === 'application/pdf') {
        onAttachment({kind: 'notice', name: f.name, result: await readNotice(f, 'application/pdf')});
      } else {
        const {upload, thumb} = await prepareImage(f, 2000);
        onAttachment({kind: 'notice', name: f.name, thumb, result: await readNotice(upload, 'image/jpeg')});
      }
    });
  const onAudio = (f: File) =>
    run('Transcribing recording…', async () => {
      const mime = f.type || 'audio/mpeg';
      onTranscript(await transcribeFile(f, mime));
    });

  const pick = (ref: React.RefObject<HTMLInputElement | null>, handler: (f: File) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handler(f);
    if (ref.current) ref.current.value = '';
  };

  return (
    <span className="attach-wrap">
      <button
        type="button"
        className="mic"
        aria-label="Attach a photo, court notice or recording"
        aria-expanded={open}
        title="Attach · analyzed with Gemini"
        disabled={!!busy}
        onClick={() => setOpen(o => !o)}
      >
        <PaperclipIcon />
      </button>
      {busy && <span className="mic-hint">{busy}</span>}
      {open && (
        <span className="attach-menu" role="menu">
          <button role="menuitem" onClick={() => photo.current?.click()}>
            <strong>Photo of a condition</strong>
            <span>Mold, leaks, wiring… Gemini describes it</span>
          </button>
          <button role="menuitem" onClick={() => notice.current?.click()}>
            <strong>Court notice or rent demand</strong>
            <span>Reads index no., hearing, arrears</span>
          </button>
          <button role="menuitem" onClick={() => audio.current?.click()}>
            <strong>Audio recording</strong>
            <span>Transcribed into the message box</span>
          </button>
        </span>
      )}
      <input ref={photo} type="file" accept="image/*" capture="environment" hidden onChange={pick(photo, onPhoto)} />
      <input ref={notice} type="file" accept="image/*,application/pdf" hidden onChange={pick(notice, onNotice)} />
      <input ref={audio} type="file" accept="audio/*" hidden onChange={pick(audio, onAudio)} />
    </span>
  );
}

const EST_VARIANT = {'Immediately hazardous': 'error', Hazardous: 'warning', 'Non-hazardous': 'neutral', Unclear: 'neutral'} as const;

/** Chat card for an analyzed attachment. */
export function AttachmentCard({a, onTellHearth, onUseNotice}: {a: Attachment; onTellHearth: (text: string) => void; onUseNotice?: (n: NoticeResult) => void}) {
  if (a.kind === 'photo') {
    const r = a.result;
    return (
      <section className="block attach-card">
        <div className="attach-row">
          <img src={a.thumb} alt={`Tenant photo: ${r.condition}`} className="attach-thumb" />
          <div className="attach-body">
            <div className="block-head">
              <Text type="label">Photo · {r.condition}</Text>
              <Badge variant={EST_VARIANT[r.hazard_estimate] ?? 'neutral'} label={`Visual estimate: ${r.hazard_estimate}`} />
            </div>
            <Text>{r.observed}</Text>
            {r.cannot_prove?.length > 0 && (
              <Text type="supporting" color="secondary">Can’t prove: {r.cannot_prove.join('; ')}.</Text>
            )}
          </div>
        </div>
        {r.is_housing_condition && (
          <div>
            <Button
              label="Tell Hearth"
              variant="secondary"
              size="sm"
              onClick={() =>
                onTellHearth(
                  `Tenant photo (inspected by Gemini): ${r.condition}. ${r.observed} Visual estimate: ${r.hazard_estimate}. Does this match any open record, and does it change next steps?`,
                )
              }
            />
          </div>
        )}
        <Text type="supporting" color="secondary">Not an HPD finding. Added to the worksheet as tenant-provided evidence.</Text>
      </section>
    );
  }
  const n = a.result;
  const rows: [string, string | null | undefined][] = [
    ['Document', n.document_type],
    ['Index no.', n.index_number],
    ['Hearing', n.hearing_datetime],
    ['Arrears claimed', n.arrears_usd != null ? `$${n.arrears_usd.toLocaleString()}` : null],
    ['Petitioner', n.landlord_or_petitioner],
    ['Dated / served', n.date_served_or_dated],
    ['Court', n.court],
  ];
  return (
    <section className="block attach-card">
      <div className="attach-row">
        {a.thumb && <img src={a.thumb} alt="Court notice" className="attach-thumb" />}
        <div className="attach-body">
          <Text type="label">Court document read by Gemini</Text>
          <dl className="notice-fields">
            {rows.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v || <span className="muted">not found</span>}</dd>
              </div>
            ))}
          </dl>
          {n.notes && <Text type="supporting" color="secondary">{n.notes}</Text>}
        </div>
      </div>
      {n.is_court_document && onUseNotice && (
        <div className="attach-actions">
          <Button label="Use in case" variant="primary" size="sm" onClick={() => onUseNotice(n)} />
        </div>
      )}
      <Text type="supporting" color="secondary">Check against the paper notice. Tenant name and unit are not extracted.</Text>
    </section>
  );
}
