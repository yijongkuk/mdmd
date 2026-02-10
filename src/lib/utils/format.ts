/** Format a number as Korean won currency */
export function formatWon(amount: number | undefined | null): string {
  amount = amount ?? 0;
  if (amount >= 100_000_000) {
    const eok = Math.floor(amount / 100_000_000);
    const man = Math.floor((amount % 100_000_000) / 10_000);
    return man > 0 ? `${eok}억 ${man.toLocaleString()}만원` : `${eok}억원`;
  }
  if (amount >= 10_000) {
    const man = Math.floor(amount / 10_000);
    return `${man.toLocaleString()}만원`;
  }
  return `${amount.toLocaleString()}원`;
}

/** Format area in square meters */
export function formatArea(m2: number | undefined | null): string {
  m2 = m2 ?? 0;
  return `${m2.toFixed(1)}m²`;
}

/** Format area in pyeong (Korean traditional unit) */
export function formatPyeong(m2: number): string {
  const pyeong = m2 / 3.3058;
  return `${pyeong.toFixed(1)}평`;
}

/** Format percentage */
export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** Format height in meters */
export function formatHeight(meters: number): string {
  return `${meters.toFixed(1)}m`;
}

/** Format a date string to Korean locale */
export function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr || '-';
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
