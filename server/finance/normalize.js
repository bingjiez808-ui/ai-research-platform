import crypto from 'node:crypto';

export const cleanCode = value => {
  const code = String(value ?? '').replace(/\D/g, '').slice(-6).padStart(6, '0');
  if (!/^\d{6}$/.test(code)) throw new Error(`Invalid A-share code: ${value}`);
  return code;
};
export const number = value => value === null || value === undefined || value === '-' ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
export const date = value => { const d = new Date(value); return Number.isNaN(d.valueOf()) ? null : d; };
export const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const marketFor = code => code.startsWith('6') ? 'SH' : (code.startsWith('4') || code.startsWith('8') ? 'BJ' : 'SZ');
export function assertQuote(q) {
  const numeric = ['price', 'open', 'high', 'low', 'previousClose'];
  for (const key of numeric) if (q[key] != null && (!Number.isFinite(q[key]) || q[key] < 0)) throw new Error(`Anomaly: ${key}=${q[key]}`);
  if (q.high && q.low && q.high < q.low) throw new Error('Anomaly: high below low');
  if (q.changePercent != null && Math.abs(q.changePercent) > 30) throw new Error(`Anomaly: changePercent=${q.changePercent}`);
  return q;
}
