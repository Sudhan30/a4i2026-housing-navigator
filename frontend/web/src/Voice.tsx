import {useRef, useState} from 'react';
import {speak, transcribe} from './api';

const MicIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);
const StopIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
  </svg>
);

/** Push-to-dictate with Google Cloud Speech-to-Text. Fills the composer; never auto-sends. */
export function MicButton({lang, onText}: {lang: string; onText: (t: string) => void}) {
  const [state, setState] = useState<'idle' | 'recording' | 'working'>('idle');
  const [err, setErr] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const supported = typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices;
  if (!supported) return null;

  async function start() {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio: true});
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
      const r = new MediaRecorder(stream, mime ? {mimeType: mime} : undefined);
      const chunks: Blob[] = [];
      r.ondataavailable = e => e.data.size && chunks.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setState('working');
        try {
          const text = await transcribe(new Blob(chunks, {type: 'audio/webm'}), lang);
          if (text) onText(text);
          else setErr('Didn’t catch that');
        } catch (e) {
          setErr((e as Error).message);
        } finally {
          setState('idle');
        }
      };
      rec.current = r;
      r.start();
      setState('recording');
    } catch {
      setErr('Microphone blocked');
    }
  }

  const label =
    state === 'recording' ? 'Stop and transcribe' : state === 'working' ? 'Transcribing…' : `Dictate (${lang === 'es-US' ? 'Spanish' : 'English'})`;
  return (
    <span className="mic-wrap">
      <button
        type="button"
        className={`mic ${state}`}
        aria-pressed={state === 'recording'}
        aria-label={label}
        title={err ?? `${label} · Google Cloud Speech-to-Text`}
        disabled={state === 'working'}
        onClick={() => (state === 'recording' ? rec.current?.stop() : start())}
      >
        {state === 'recording' ? <StopIcon /> : <MicIcon />}
      </button>
      {state === 'recording' && <span className="mic-hint">Listening…</span>}
      {state === 'working' && <span className="mic-hint">Transcribing…</span>}
      {err && state === 'idle' && <span className="mic-hint is-error">{err}</span>}
    </span>
  );
}

/** Reads Hearth's short answer aloud with Google Cloud Text-to-Speech. */
export function ReadAloud({text, label = 'Read aloud'}: {text: string; label?: string}) {
  const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle');
  const audio = useRef<HTMLAudioElement | null>(null);
  const plain = text
    .replace(/\*\*What the record can.t prove yet:\*\*/i, 'Still to prove:')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  async function toggle() {
    if (state === 'playing') {
      audio.current?.pause();
      setState('idle');
      return;
    }
    setState('loading');
    try {
      const url = await speak(plain);
      const a = new Audio(url);
      audio.current = a;
      a.onended = () => {
        setState('idle');
        URL.revokeObjectURL(url);
      };
      await a.play();
      setState('playing');
    } catch {
      setState('idle');
    }
  }
  return (
    <button type="button" className="read-aloud" onClick={toggle} disabled={state === 'loading'} title="Google Cloud Text-to-Speech">
      {state === 'playing' ? 'Stop' : state === 'loading' ? 'Loading…' : label}
    </button>
  );
}
