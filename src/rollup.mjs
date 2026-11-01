// rollup.mjs — Kar's daily rollup of the team's feed for AGENT_FEED.md: what NEEDS SIMON first, then what was
// flagged, then one group per persona. Every line in it is a line of the feed. Pure, total, deterministic,
// witness-gated. (Simon's bot-team spec 2026-11-01, §3.)
//
//   dayOf(ts)                    → the London date (YYYY-MM-DD) of a time, or ''
//   needsSimon(lines)            → every needs_owner line Simon has not answered with a signed decision, oldest first
//   flagged(lines, date)         → that day's lines that carry a flag
//   byPersona(lines, date)       → [[agent, lines]] for that day, in roster order, only agents that wrote
//   auditOf(lines, id)           → the auditor's latest verdict on a line ('PASS' | 'FLAG' | 'FAIL'), or null
//   rollup(lines, { date })      → the markdown section
//   insert(md, section)          → AGENT_FEED.md with the section above its first ## heading (an earlier rollup of the
//                                  same date replaced); every other section left byte for byte
import { AGENTS, answered } from './feed.mjs';

export const NAMES = Object.freeze({ kar: 'Kar', builder: 'Builder', 'money-time': 'Money time', reach: 'Reach', scout: 'Scout', 'client-lead': 'Client lead', 'card-keeper': 'Card Keeper', auditor: 'Auditor', simon: 'Simon' });
export const HEAD = "## Kar's rollup · ";
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const list = (lines) => (Array.isArray(lines) ? lines.filter((x) => isObj(x) && typeof x.id === 'string') : []);
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

const parts = (ts) => {
  const t = typeof ts === 'string' ? Date.parse(ts) : NaN;
  if (!Number.isFinite(t)) return null;
  const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { day: p.year + '-' + p.month + '-' + p.day, time: p.hour + ':' + p.minute };
};
export const dayOf = (ts) => (parts(ts) || { day: '' }).day;

export function needsSimon(lines) {
  const L = list(lines), done = answered(L);
  return L.filter((x) => x.needs_owner === true && !done[x.id]);
}

export const flagged = (lines, date) => list(lines).filter((x) => dayOf(x.ts) === date && Array.isArray(x.flags) && x.flags.length > 0);

export function byPersona(lines, date) {
  const L = list(lines).filter((x) => dayOf(x.ts) === date);
  return AGENTS.map((a) => [a, L.filter((x) => x.agent === a)]).filter(([, xs]) => xs.length > 0);
}

export function auditOf(lines, id) {
  let v = null;
  for (const x of list(lines)) if (x.agent === 'auditor' && x.ref === id && ['PASS', 'FLAG', 'FAIL'].includes(x.verdict)) v = x.verdict;
  return v;
}

const clip = (s, n = 240) => { const t = String(s).replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
function item(x, L, withAudit) {
  const p = parts(x.ts) || { day: '', time: '' };
  const bits = ['- ' + p.time + ' **' + (NAMES[x.agent] || x.agent) + '** [' + x.kind + (x.to ? ' → ' + (NAMES[x.to] || x.to) : '') + '] ' + clip(x.what)];
  if (x.link) bits.push(' · ' + x.link);
  bits.push(' · `' + x.id.slice(0, 12) + '`');
  if (Array.isArray(x.flags) && x.flags.length) bits.push(' · ⚑ ' + x.flags.join(', '));
  if (withAudit) bits.push(' · auditor: ' + (auditOf(L, x.id) || 'not yet audited'));
  return bits.join('');
}

export function rollup(lines, { date } = {}) {
  if (typeof date !== 'string' || !DATE.test(date)) return '';
  const L = list(lines), needs = needsSimon(L), flags = flagged(L, date), groups = byPersona(L, date);
  const out = [HEAD + date, ''];
  out.push('### NEEDS SIMON (' + needs.length + ')', '');
  out.push(...(needs.length ? needs.map((x) => item(x, L, true)) : ['- nothing is waiting for you']), '');
  out.push('### Flagged (' + flags.length + ')', '');
  out.push(...(flags.length ? flags.map((x) => item(x, L, false)) : ['- nothing flagged']), '');
  for (const [a, xs] of groups) out.push('### ' + NAMES[a] + ' (' + xs.length + ')', '', ...xs.map((x) => item(x, L, false)), '');
  return out.join('\n');
}

export function insert(md, section) {
  const text = typeof md === 'string' ? md : '', sec = typeof section === 'string' ? section.replace(/\s+$/, '') + '\n\n' : '';
  if (!sec.trim()) return text;
  const lines = text.split('\n'), head = sec.split('\n')[0];
  const same = lines.findIndex((l) => l === head);
  if (same >= 0) {
    let end = same + 1;
    while (end < lines.length && !lines[end].startsWith('## ')) end++;
    return lines.slice(0, same).join('\n') + (same ? '\n' : '') + sec + lines.slice(end).join('\n');
  }
  const first = lines.findIndex((l) => l.startsWith('## '));
  if (first < 0) return text.replace(/\n*$/, text ? '\n\n' : '') + sec;
  return lines.slice(0, first).join('\n') + (first ? '\n' : '') + sec + lines.slice(first).join('\n');
}

export default { NAMES, HEAD, dayOf, needsSimon, flagged, byPersona, auditOf, rollup, insert };
