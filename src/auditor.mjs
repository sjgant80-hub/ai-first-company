// auditor.mjs — the bot team's separate judge: every claim against its receipt, every tool against the bot's fence,
// every outward word against the team law. Pure, total, deterministic, witness-gated; it decides and changes nothing.
// (Simon's bot-team spec 2026-11-01, §1 AUDITOR, §4, §7.) tools/audit.mjs gathers the facts and writes the verdicts.
//
//   audit(line, facts, ctx)  → { verdict: 'PASS' | 'FLAG' | 'FAIL', checks: [{ check, result: 'ok' | 'FLAG' | 'FAIL', evidence }] }
//       facts: { receipt: { found, sha256, text }, seal: { named, ancestor }, rerun: { ran, exit, cmd }, judge: [{ label, quote }] }
//       ctx:   { roster, lines (read from the feed, with signed), consent: { partners: [{ name, consent }] } }
//   auditable(line, ctx)     → does this line get a verdict? (builds, receipts, listings, posts, needs-owner lines, done
//                              claims, lines naming the tools they used, lines whose own tool is off the bot's list)
//   pinOf(link)              → { repo, commit, path } for a link pinned to a commit, or null
//   fractions(text)          → every 'a of b' / 'a/b' in the text, as [a, b]
//   backed(receipt, a, b)    → does the receipt show a of b (as text, or a held/killed and of/total pair in one object)?
//   verdicts(lines)          → { [ref]: the auditor's latest SIGNED verdict on it }
//   forApproval(lines)       → the open needs-owner lines whose latest signed verdict is PASS: all that goes to Simon
//   heldBack(lines)          → the other open needs-owner lines, with the verdict that holds them
import { claimsDone, answered } from './feed.mjs';
import { may, toolOf } from './roster.mjs';

export const RESULTS = Object.freeze(['PASS', 'FLAG', 'FAIL']);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : '');
const list = (v) => (Array.isArray(v) ? v.filter(isObj) : []);
const OUT_KINDS = Object.freeze(['post', 'listing']);
const CHECKED = Object.freeze(['build', 'receipt', 'listing', 'post']);

// ── the words ───────────────────────────────────────────────────────────────────────────────────────────────────
export const EARN = [
  /\b(?:earn|earning|make|making|save|saving|saves|boost|increase|grow|double|triple|cut|slash|reduce)\b[^.!?]{0,60}?(?:[£$€]\s?\d[\d,.]*[kmb]?|\d+(?:\.\d+)?\s*%|\b\d+x\b)/i,
  /\b(?:passive income|extra income|side income|financial freedom|get rich|(?:six|seven|6|7)[- ]figures?|make money|making money|money while you sleep|return on investment|roi|pays for itself)\b/i,
  /\b(?:double|triple|10x|5x|2x|skyrocket|explode|supercharge)\s+(?:your\s+)?(?:revenue|income|sales|profits?|earnings|growth|productivity|business)\b/i,
];
export const CRYPTO = /\b(?:crypto\w*|bitcoin|btc|ethereum|eth|solana|nfts?|web3|defi|airdrops?|altcoins?|memecoins?|token\s+(?:sale|launch|presale|holders?)|presale|tokenomics|staking|blockchain|on-?chain|hodl|to the moon|kcc)\b/i;
export const HYPE = /\b(?:guarantee[sd]?|guaranteeing|100\s?% (?:accurate|safe|secure|reliable|proven|guaranteed|success)|never fails?|zero (?:risk|bugs|errors|downtime)|bulletproof|unhackable|best[- ]in[- ]class|the best|number one|world'?s (?:best|first|leading|most)|industry[- ]leading|market[- ]leading|revolutionary|game[- ]chang\w+|the only|first ever|unmatched|unbeatable|risk[- ]free|always works)\b|#1\b/i;
export const MONEY = /[£$€]\s?\d[\d,.]*/;
export const NUMBER = /\b\d+(?:\.\d+)?\s?%|\b\d+x\b|\b\d[\d,]*\s*(?:of|\/)\s*\d+|\b\d[\d,.]*\s*(?:hours?|minutes?|days?|weeks?|users?|customers?|clients?|businesses|companies|teams|times|faster|more|less)\b/i;
export const JARGON = /\b(?:konomif\w*|sididy|si-didy|karma-didy|wisp|the estate|organs?|spiral)\b|[κφ]/i;

const quote = (re, t) => { const m = re.exec(t); return m ? m[0] : null; };

function words(line, ctx) {
  const t = [str(line.what), str(line.quote)].filter(Boolean).join(' ');
  const hard = OUT_KINDS.includes(line.kind) ? 'FAIL' : 'FLAG';
  const out = [];
  for (const re of EARN) { const q = quote(re, t); if (q) { out.push({ check: 'words', result: hard, evidence: `an earnings or savings claim: "${q}"` }); break; } }
  const c = quote(CRYPTO, t); if (c) out.push({ check: 'words', result: hard, evidence: `crypto wording: "${c}"` });
  const h = quote(HYPE, t); if (h) out.push({ check: 'words', result: 'FLAG', evidence: `a guarantee or superlative: "${h}"` });
  const m = quote(MONEY, t); if (m) out.push({ check: 'words', result: 'FLAG', evidence: `a money amount: "${m}" (prices are Simon's)` });
  const n = quote(NUMBER, t); if (n && !str(line.link)) out.push({ check: 'words', result: 'FLAG', evidence: `a number with no receipt: "${n}"` });
  for (const p of list(isObj(ctx.consent) ? ctx.consent.partners : [])) if (p.consent !== true && str(p.name) && t.toLowerCase().includes(p.name.toLowerCase())) out.push({ check: 'words', result: 'FLAG', evidence: `names ${p.name} without recorded consent` });
  const j = quote(JARGON, t); if (j) out.push({ check: 'words', result: 'FLAG', evidence: `in-house jargon: "${j}"` });
  const long = t.split(/(?<=[.!?])\s+/).find((s) => s.split(/\s+/).filter(Boolean).length > 40);
  if (long) out.push({ check: 'words', result: 'FLAG', evidence: 'a sentence over 40 words' });
  return out;
}

// ── receipts ────────────────────────────────────────────────────────────────────────────────────────────────────
export function pinOf(link) {
  const m = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/blob\/([0-9a-f]{40})\/(\S+)$/.exec(str(link));
  return m ? { repo: m[1], commit: m[2], path: m[3] } : null;
}

const NUM = '(\\d{1,3}(?:,\\d{3})+|\\d+)';
export function fractions(text) {
  return [...str(text).matchAll(new RegExp('(?<![\\d.,])' + NUM + '\\s*(?:of|\\/)\\s*' + NUM + '(?![\\d])', 'g'))].map((m) => [m[1].replace(/,/g, ''), m[2].replace(/,/g, '')]);
}

const HELD = Object.freeze(['held', 'killed', 'passed']);
const OF = Object.freeze(['of', 'total']);
function pairIn(v, a, b) {
  if (Array.isArray(v)) return v.some((x) => pairIn(x, a, b));
  if (!isObj(v)) return false;
  if (HELD.some((k) => v[k] === a) && OF.some((k) => v[k] === b)) return true;
  return Object.values(v).some((x) => pairIn(x, a, b));
}
export function backed(receipt, a, b) {
  const t = str(receipt);
  if (new RegExp('(?<![\\d.])' + a + '\\s*(?:of|\\/)\\s*' + b + '(?![\\d])').test(t)) return true;
  try { return pairIn(JSON.parse(t), +a, +b); } catch { return false; }
}

function receipt(line, facts) {
  if (!claimsDone(line.kind, line.what) && line.receipt_sha256 === undefined) return [];
  if (!str(line.link)) return [{ check: 'receipt', result: 'FLAG', evidence: 'a done with no receipt link' }];
  const pin = pinOf(line.link);
  if (!pin) return [{ check: 'receipt', result: 'FLAG', evidence: 'the receipt link is not pinned to a commit: ' + line.link }];
  const where = pin.commit.slice(0, 7) + ':' + pin.path;
  if (typeof line.receipt_sha256 !== 'string') return [{ check: 'receipt', result: 'FLAG', evidence: 'no receipt_sha256 to re-hash at ' + where }];
  const r = isObj(facts.receipt) ? facts.receipt : {};
  if (r.found !== true) return [{ check: 'receipt', result: 'FAIL', evidence: 'receipt not found at ' + where }];
  if (r.sha256 !== line.receipt_sha256) return [{ check: 'receipt', result: 'FAIL', evidence: `receipt hash differs at ${where}: the line says ${line.receipt_sha256.slice(0, 12)}, it re-hashes to ${str(r.sha256).slice(0, 12)}` }];
  const out = [{ check: 'receipt', result: 'ok', evidence: `re-hashed ${line.receipt_sha256.slice(0, 12)} at ${where}` }];
  for (const [a, b] of fractions(line.what)) if (!backed(r.text, a, b)) out.push({ check: 'receipt', result: 'FLAG', evidence: `the line says ${a} of ${b}; the receipt does not show it` });
  if (/\bclean\b/i.test(line.what) && /"clean":\s*false/.test(str(r.text))) out.push({ check: 'receipt', result: 'FAIL', evidence: 'the line says clean; the receipt says clean false' });
  return out;
}

function seal(line, facts) {
  if (line.kind !== 'build' || !isObj(facts.receipt) || facts.receipt.found !== true) return [];
  const s = facts.seal;
  if (!isObj(s)) return [{ check: 'seal', result: 'FLAG', evidence: 'the seal was not checked' }];
  if (!str(s.named)) return [{ check: 'seal', result: 'FAIL', evidence: 'the receipt names no seal' }];
  return s.ancestor === true ? [{ check: 'seal', result: 'ok', evidence: `sealed at ${s.named}, before the code` }] : [{ check: 'seal', result: 'FAIL', evidence: `seal ${s.named} is not before the code` }];
}

function rerun(facts) {
  const r = facts.rerun;
  if (!isObj(r) || r.ran !== true) return [];
  return r.exit === 0 ? [{ check: 'rerun', result: 'ok', evidence: 're-ran: ' + str(r.cmd) }] : [{ check: 'rerun', result: 'FAIL', evidence: `re-ran ${str(r.cmd)}: exit ${r.exit}` }];
}

// ── the fence ───────────────────────────────────────────────────────────────────────────────────────────────────
export function verdicts(lines) {
  const out = {};
  for (const x of list(lines)) if (x.agent === 'auditor' && x.signed === true && RESULTS.includes(x.verdict) && str(x.ref)) out[x.ref] = x.verdict;
  return out;
}

const toolsUsed = (line) => [...new Set([toolOf(line), ...(Array.isArray(line.evidence) ? line.evidence : []).filter((e) => typeof e === 'string' && e.startsWith('tool:')).map((e) => e.slice(5))].filter(Boolean))];

function tools(line, ctx) {
  const target = str(line.ref) || str(line.id), L = list(ctx.lines);
  const c = { auditorPass: verdicts(L)[target] === 'PASS', simonGo: (answered(L)[target] || {}).verdict === 'approve' };
  const out = [], fine = [];
  for (const t of toolsUsed(line)) {
    const r = may(ctx.roster, line.agent, t, c);
    if (r.ok) fine.push(t);
    else out.push({ check: 'tools', result: r.why === 'off-list' || r.why === 'unknown tool' ? 'FLAG' : 'FAIL', evidence: `${t}: ${r.why}` });
  }
  if (fine.length) out.unshift({ check: 'tools', result: 'ok', evidence: 'on the list: ' + fine.join(', ') });
  return out;
}

function judge(line, facts) {
  if (!OUT_KINDS.includes(line.kind)) return [];
  return list(facts.judge).filter((j) => str(j.label)).map((j) => ({ check: 'judge', result: 'FLAG', evidence: `the local model: ${j.label}: "${str(j.quote)}"` }));
}

export function auditable(line, ctx) {
  if (!isObj(line) || line.agent === 'simon' || line.agent === 'auditor') return false;
  if (CHECKED.includes(line.kind) || line.needs_owner === true || claimsDone(line.kind, line.what)) return true;
  if (Array.isArray(line.evidence) && line.evidence.some((e) => typeof e === 'string' && e.startsWith('tool:'))) return true;
  return !may(isObj(ctx) ? ctx.roster : null, line.agent, toolOf(line), {}).ok;
}

export function audit(line, facts, ctx) {
  if (!isObj(line)) return { verdict: 'FAIL', checks: [{ check: 'line', result: 'FAIL', evidence: 'not a line' }] };
  const F = isObj(facts) ? facts : {}, C = isObj(ctx) ? ctx : {};
  const words_ = OUT_KINDS.includes(line.kind) || line.needs_owner === true ? words(line, C) : [];
  const checks = [...receipt(line, F), ...seal(line, F), ...rerun(F), ...tools(line, C), ...words_, ...judge(line, F)];
  const verdict = checks.some((c) => c.result === 'FAIL') ? 'FAIL' : checks.some((c) => c.result === 'FLAG') ? 'FLAG' : 'PASS';
  return { verdict, checks };
}

// ── what reaches Simon ──────────────────────────────────────────────────────────────────────────────────────────
const open = (lines) => { const L = list(lines), done = answered(L); return L.filter((x) => x.needs_owner === true && x.agent !== 'simon' && typeof x.id === 'string' && !done[x.id]); };
export const forApproval = (lines) => { const v = verdicts(lines); return open(lines).filter((x) => v[x.id] === 'PASS'); };
export const heldBack = (lines) => { const v = verdicts(lines); return open(lines).filter((x) => v[x.id] !== 'PASS').map((x) => ({ line: x, verdict: v[x.id] || 'not yet audited' })); };

export default { RESULTS, EARN, CRYPTO, HYPE, MONEY, NUMBER, JARGON, pinOf, fractions, backed, verdicts, auditable, audit, forApproval, heldBack };
