// feed.mjs — the bot team's one shared feed: one JSON line per action, written by every persona, read by Kar's rollup
// and by the auditor. Pure, total, deterministic, witness-gated. (Simon's bot-team spec 2026-11-01, §3 and §6.)
//
//   redact(text)              → { text, hits } — keys, tokens, emails and card numbers out before anything is stored
//   claimsDone(kind, what)    → does this line say work is finished?
//   entry(input, lines?)      → { ok: true, line } | { ok: false, why } — the line exactly as it will be stored
//   signingText(line)         → the text a persona's key signs: the line without sig, keys sorted
//   idOf(line)                → the line's id: SHA-256 of its signing text
//   read(jsonl, isSigned?)    → { lines: [{ ...line, id, signed }], skipped } — every valid line, in file order
//   append(jsonl, line)       → the file with one more line
//   appendOnly(before, after) → was nothing removed or changed (every earlier line still there, in order)?
//   pausedSet(lines)          → the personas (and 'team') paused now
//   mayAct(lines, agent)      → may this agent act now?
//   answered(lines)           → { [line id]: the latest signed simon approve or deny on it }
import { canonical, hashOf } from './journal.mjs';

export const PERSONAS = Object.freeze(['kar', 'builder', 'money-time', 'reach', 'scout', 'client-lead', 'card-keeper', 'auditor']);
export const AGENTS = Object.freeze([...PERSONAS, 'simon']);
export const KINDS = Object.freeze(['task', 'handoff', 'build', 'receipt', 'listing', 'post', 'lead', 'decision', 'blocker', 'note']);
export const VERDICTS = Object.freeze(['approve', 'deny', 'pause', 'unpause', 'PASS', 'FLAG', 'FAIL']);
export const DONE_WORDS = Object.freeze(['done', 'finished', 'complete', 'completed', 'shipped', 'live', 'fixed', 'passed', 'built', 'merged', 'released', 'published', 'deployed', 'delivered', 'verified', 'proven', 'green', 'landed', 'resolved', 'sealed', 'posted', 'sent', 'submitted', 'forged']);
const NEGATE = Object.freeze(['not', 'no', 'never', 'yet', 'until']);
const OUTWARD = Object.freeze(['post', 'listing']);
const CLAIM_KINDS = Object.freeze(['build', 'receipt']);
const PAUSERS = Object.freeze(['simon', 'kar', 'auditor']);
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const SHA = /^[0-9a-f]{64}$/;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : '');

// ── redaction ───────────────────────────────────────────────────────────────────────────────────────────────────
// Whole constructs go: a header with its credential, a link carrying a secret parameter, a name = value pair. What is
// left is a marker naming the class, so the auditor can see that something nearly leaked.
const SECRET_PARAM = /[?&#](?:access_token|refresh_token|id_token|token|api_key|apikey|key|secret|client_secret|password|passwd|auth|sig|signature)=[^&#\s]+/i;
const RULES = [
  ['key', /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g],
  ['key', /-----BEGIN [A-Z ]*PRIVATE KEY-----(?:\s*[A-Za-z0-9+/=]{16,})*/g],
  ['token', /\bhttps?:\/\/[^\s<>"']+/g, (m) => SECRET_PARAM.test(m)],
  ['token', /\b(?:Proxy-)?Authorization\s*:\s*(?:Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{16,}|\b(?:Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{16,}/gi],
  ['token', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
  ['key', /\bsk-[A-Za-z0-9_-]{20,}/g],
  ['key', /\bgithub_pat_[A-Za-z0-9_]{30,}/g],
  ['key', /\bgh[pousr]_[A-Za-z0-9]{30,}/g],
  ['key', /\bxai-[A-Za-z0-9]{20,}/g],
  ['key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['key', /\b[srp]k_(?:live|test)_[A-Za-z0-9]{10,}/g],
  ['key', /\bxox[abprs]-[A-Za-z0-9-]{10,}/g],
  ['key', /\bAIza[A-Za-z0-9_-]{30,}/g],
  ['token', /\bnpm_[A-Za-z0-9]{30,}/g],
  ['token', /\bhf_[A-Za-z0-9]{30,}/g],
  ['token', /\bwhsec_[A-Za-z0-9+/=]{20,}/g],
  ['token', /\b(?:client_secret|secret_key|private_key|access_key|access_token|refresh_token|auth_token|api_key|apikey|password|passwd|secret|token)\s*[:=]\s*"?[^\s"]{8,}"?/gi],
  ['email', /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, (m, at, text) => text[at + m.length] !== ':'],
  ['card', /(?<![A-Za-z0-9])\d(?:[ -]?\d){12,18}(?![A-Za-z0-9])/g, (m) => isCard(m.replace(/[ -]/g, ''))],
];
// card numbers are looked for outside links only (a post id in a link is not a card)
const LINK_SPLIT = /(\bhttps?:\/\/[^\s<>"']+)/;

/** does this digit string pass the Luhn check and start like a card of its length? */
export function isCard(d) {
  if (!/^\d{13,19}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let x = +d[d.length - 1 - i];
    if (i % 2 === 1) x = (x * 2) % 10 + Math.floor(x / 5);
    sum += x;
  }
  if (sum % 10 !== 0) return false;
  const n = d.length, p2 = +d.slice(0, 2), p4 = +d.slice(0, 4);
  if (d[0] === '4') return n === 13 || n === 16 || n === 19;
  if (p2 >= 51 && p2 <= 55) return n === 16;
  if (p4 >= 2221 && p4 <= 2720) return n === 16;
  if (p2 === 34 || p2 === 37) return n === 15;
  if (p4 === 6011 || p2 === 65) return n === 16 || n === 19;
  return false;
}

export function redact(text) {
  let t = str(text);
  const hits = {};
  for (const [cls, re, keep] of RULES) {
    const one = (s) => s.replace(re, (...a) => {
      const m = a[0];
      if (keep && !keep(m, a[a.length - 2], a[a.length - 1])) return m;
      hits[cls] = (hits[cls] || 0) + 1;
      return '[redacted:' + cls + ']';
    });
    t = cls === 'card' ? t.split(LINK_SPLIT).map((seg, i) => (i % 2 ? seg : one(seg))).join('') : one(t);
  }
  return { text: t, hits };
}

// ── done claims ─────────────────────────────────────────────────────────────────────────────────────────────────
const words = (s) => str(s).toLowerCase().replace(/[‘’]/g, "'").split(/[^a-z']+/).map((w) => w.replace(/^'+|'+$/g, '')).filter(Boolean);
const negates = (w) => NEGATE.includes(w) || w.endsWith("n't");

export function claimsDone(kind, what) {
  if (CLAIM_KINDS.includes(kind)) return true;
  const w = words(what);
  return w.some((x, i) => DONE_WORDS.includes(x) && !w.slice(Math.max(0, i - 3), i).some(negates));
}

// ── the line ────────────────────────────────────────────────────────────────────────────────────────────────────
export const signingText = (line) => { const { sig, ...rest } = isObj(line) ? line : {}; return canonical(rest); };
export const idOf = (line) => hashOf(signingText(line));

function check(x) {
  if (!isObj(x)) return 'not a line';
  if (typeof x.ts !== 'string' || !ISO.test(x.ts) || !Number.isFinite(Date.parse(x.ts))) return 'ts is not an ISO 8601 time';
  if (!AGENTS.includes(x.agent)) return 'unknown agent';
  if (!KINDS.includes(x.kind)) return 'unknown kind';
  if (typeof x.what !== 'string' || !x.what.trim()) return 'empty what';
  if (x.link !== undefined && typeof x.link !== 'string') return 'link is not text';
  if (x.needs_owner !== undefined && typeof x.needs_owner !== 'boolean') return 'needs_owner is not true or false';
  if (x.receipt_sha256 !== undefined && !(typeof x.receipt_sha256 === 'string' && SHA.test(x.receipt_sha256))) return 'receipt_sha256 is not a SHA-256';
  if (x.kind === 'handoff' && !PERSONAS.includes(x.to)) return 'a handoff must name the next persona';
  if (x.to !== undefined && !PERSONAS.includes(x.to)) return 'to is not a persona';
  if (x.ref !== undefined && !(typeof x.ref === 'string' && x.ref.length > 0 && x.ref.length <= 200)) return 'ref is not a line id or persona';
  if (x.verdict !== undefined && !VERDICTS.includes(x.verdict)) return 'unknown verdict';
  if (x.quote !== undefined && typeof x.quote !== 'string') return 'quote is not text';
  if (x.evidence !== undefined && !(Array.isArray(x.evidence) && x.evidence.every((e) => typeof e === 'string'))) return 'evidence is not a list of pointers';
  return null;
}

/** the line as it will be stored: redacted, flagged by the writer (never by the caller), unsigned */
export function entry(input, lines = []) {
  const why = check(input);
  if (why) return { ok: false, why };
  const flags = [];
  const classes = new Set();
  const clean = (s) => { const r = redact(s); for (const k of Object.keys(r.hits)) classes.add(k); return r.text; };
  const line = { ts: input.ts, agent: input.agent, kind: input.kind, what: clean(input.what.trim()), link: clean(str(input.link).trim()), needs_owner: input.needs_owner === true };
  if (OUTWARD.includes(input.kind) && !line.needs_owner) { line.needs_owner = true; flags.push('needs-owner-forced'); }
  if (input.receipt_sha256 !== undefined) line.receipt_sha256 = input.receipt_sha256;
  if (input.to !== undefined) line.to = input.to;
  if (input.ref !== undefined) line.ref = input.ref;
  if (input.verdict !== undefined) line.verdict = input.verdict;
  if (input.quote !== undefined) line.quote = clean(input.quote);
  if (input.evidence !== undefined) line.evidence = input.evidence.map(clean);
  for (const k of classes) flags.push('redacted:' + k);
  if (claimsDone(line.kind, line.what) && !line.link) flags.push('no-receipt');
  if (!mayAct(lines, line.agent)) flags.push('while-paused');
  line.flags = flags;
  return { ok: true, line };
}

/** a stored line is valid when it reads as an entry would have written it */
const stored = (x) => isObj(x) && check(x) === null && typeof x.link === 'string' && typeof x.needs_owner === 'boolean' && Array.isArray(x.flags) && x.flags.every((f) => typeof f === 'string') && (x.sig === undefined || typeof x.sig === 'string');

export function read(jsonl, isSigned = () => false) {
  const lines = [];
  let skipped = 0;
  for (const raw of str(jsonl).split(/\r?\n/)) {
    if (!raw.trim()) continue;
    let x;
    try { x = JSON.parse(raw); } catch { skipped++; continue; }
    if (!stored(x)) { skipped++; continue; }
    let signed = false;
    try { signed = isSigned(x) === true; } catch { signed = false; }
    lines.push({ ...x, id: idOf(x), signed });
  }
  return { lines, skipped };
}

export function append(jsonl, line) {
  const t = str(jsonl);
  return t + (t && !t.endsWith('\n') ? '\n' : '') + JSON.stringify(line) + '\n';
}

export function appendOnly(before, after) {
  const a = str(before).split(/\r?\n/).filter((l) => l.trim()), b = str(after).split(/\r?\n/).filter((l) => l.trim());
  let j = 0;
  for (const l of a) { while (j < b.length && b[j] !== l) j++; if (j === b.length) return false; j++; }
  return true;
}

// ── the kill switch and Simon's answers ─────────────────────────────────────────────────────────────────────────
const list = (lines) => (Array.isArray(lines) ? lines.filter(isObj) : []);
const counts = (x) => x.agent !== 'simon' || x.signed === true;

export function pausedSet(lines) {
  const p = new Set();
  for (const x of list(lines)) {
    if (x.kind !== 'decision' || !counts(x) || !(PERSONAS.includes(x.ref) || x.ref === 'team')) continue;
    if (x.verdict === 'pause' && PAUSERS.includes(x.agent)) p.add(x.ref);
    if (x.verdict === 'unpause' && x.agent === 'simon') p.delete(x.ref);
  }
  return p;
}

export function mayAct(lines, agent) {
  if (agent === 'simon') return true;
  const p = pausedSet(lines);
  return !p.has('team') && !p.has(agent);
}

export function answered(lines) {
  const out = {};
  for (const x of list(lines)) if (x.agent === 'simon' && x.signed === true && x.kind === 'decision' && (x.verdict === 'approve' || x.verdict === 'deny') && typeof x.ref === 'string') out[x.ref] = { verdict: x.verdict, ts: x.ts, quote: str(x.quote) };
  return out;
}

export default { PERSONAS, AGENTS, KINDS, VERDICTS, DONE_WORDS, isCard, redact, claimsDone, entry, signingText, idOf, read, append, appendOnly, pausedSet, mayAct, answered };
