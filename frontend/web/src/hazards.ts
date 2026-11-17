/** NYC HPD hazard classes in plain language (deadline = landlord's legal time to correct). */
export const HAZARD_CLASS: Record<string, {label: string; deadline: string; variant: 'error' | 'warning' | 'neutral'; color: string}> = {
  'Class C': {label: 'Immediately hazardous', deadline: '24 h to fix', variant: 'error', color: '#b91c1c'},
  'Class B': {label: 'Hazardous', deadline: '30 days to fix', variant: 'warning', color: '#b45309'},
  'Class A': {label: 'Non-hazardous', deadline: '90 days to fix', variant: 'neutral', color: '#64748b'},
};

export function violationClass(type: string): string | null {
  const m = (type ?? '').match(/CLASS\s+([ABC])\b/i);
  return m ? `Class ${m[1].toUpperCase()}` : null;
}
