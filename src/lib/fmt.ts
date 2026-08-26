export function fmtCurrency(v: number) {
  const digits = Math.abs(v) < 100 ? 2 : 0
  return new Intl.NumberFormat('en-AU', {
    style: 'currency', currency: 'AUD',
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(v)
}

export function fmtNumber(v: number) {
  return new Intl.NumberFormat('en-AU').format(Math.round(v))
}

export function fmtPercent(v: number, decimals = 1) {
  return `${v.toFixed(decimals)}%`
}

export function fmtDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export function fmtCPC(spend: number, clicks: number) {
  if (!clicks) return '—'
  return fmtCurrency(spend / clicks)
}

export function fmtCPA(spend: number, conversions: number) {
  if (!conversions) return '—'
  return fmtCurrency(spend / conversions)
}

export function delta(current: number, prior: number): number | undefined {
  if (!prior) return undefined
  return ((current - prior) / prior) * 100
}

export function pct(numerator: number, denominator: number): number {
  if (!denominator) return 0
  return (numerator / denominator) * 100
}
