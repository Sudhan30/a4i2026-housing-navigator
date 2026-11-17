export function HearthMark({size = 24}: {size?: number}) {
  return (
    <span className="hearth-mark" style={{width: size, height: size}} aria-hidden="true">
      <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62}>
        <path
          fill="currentColor"
          d="M12 2c1 3.5 5 5.6 5 10.2A5 5 0 0 1 12 17a5 5 0 0 1-5-4.8c0-2.4 1.3-3.9 2.6-5.2.2 1.7 1 2.8 2.1 3.4C11.3 8 11.3 5 12 2Z"
        />
        <rect x="5" y="19" width="14" height="2.2" rx="1.1" fill="currentColor" opacity="0.55" />
      </svg>
    </span>
  );
}
