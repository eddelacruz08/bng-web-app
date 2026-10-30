export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function formatShortDate(d = new Date()): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${n} ${n === 1 ? word : pluralWord}`;
}
