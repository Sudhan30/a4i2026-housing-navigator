// House-with-doorway mark (civic, not a flame).
export function HearthMark({size = 24}: {size?: number}) {
  return (
    <span className="hearth-mark" style={{width: size, height: size}} aria-hidden="true">
      <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round">
        <path d="M3.5 10.5 12 4l8.5 6.5" />
        <path d="M5.5 9v10.5h13V9" />
        <path d="M10 19.5v-5h4v5" />
      </svg>
    </span>
  );
}
