// origin.mjs — the Origination Engine's gate (Simon's spec, 17 Nov 2026; sealed in data/origin-prereg.json).
// Ideas are free; validation is the gate. A gap goes forward only with ATTESTED demand, inside the estate's own forest;
// the cheapest demand test is written down before it runs; the market's answer, not Kar's confidence, decides what is
// built. A test nobody saw is UNRUN, never a kill. Pure, total, deterministic: dates are passed in, nothing is fetched.
//
//   FOREST, KINDS, TEST_KINDS, METRICS     the vocabulary
//   attest(gap, asOf)        → { ok, why: [reasons it is refused], counted: { items, hosts, kinds, paying } }
//   normalizeTest(spec)      → { ok, test } | { ok: false, why }: a demand test, whole, sealed before it opens
//   judge(test, result, asOf) → { decision: OPEN | UNRUN | BUILD | KILL, why } | { ok: false, why }
//   stageOf(idea, asOf)      → daydream | attested | testing | build | kill | unrun
//   funnel(ideas, asOf)      → the ledger's counts at each stage, the spend, and what the kills cost

export const FOREST = Object.freeze(['sovereign-ai', 'mcp-agent-tooling', 'verification', 'slm-niche', 'trust-layer']);
export const KINDS = Object.freeze(['looking', 'paying', 'complaining']);
export const TEST_KINDS = Object.freeze(['post', 'issue', 'listing', 'landing', 'waitlist']);
export const METRICS = Object.freeze(['clicks', 'signups', 'reactions', 'installs', 'preorders', 'views', 'impressions']);
export const MAX_AGE_DAYS = 365, MAX_WINDOW_DAYS = 30, MAX_SAID_WORDS = 25;
const SIMONS = Object.freeze(['waitlist']);   // a test kind that collects personal data
const MONEY_METRICS = Object.freeze(['preorders', 'signups']);   // money taken, or personal data held

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const str = (x) => (typeof x === 'string' ? x.trim() : '');
const list = (x) => (Array.isArray(x) ? x : []);
const DAY = 86400000;
/** a calendar date, YYYY-MM-DD, as milliseconds at UTC midnight; NaN when it is not a real date */
export function dayOf(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(s));
  if (!m) return NaN;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]), d = new Date(t);
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? t : NaN;
}
const hostOf = (u) => { const m = /^https:\/\/([^/?#\s]+)/i.exec(str(u)); return m ? m[1].toLowerCase().replace(/^www\./, '') : null; };

/** attest(gap, asOf): the first wall. A gap is not a market without evidence. */
export function attest(gap, asOf) {
  const g = isObj(gap) ? gap : {}, now = dayOf(asOf), why = [];
  if (Number.isNaN(now)) return { ok: false, why: ['no scan date'], counted: { items: 0, hosts: 0, kinds: 0, paying: 0 } };
  if (!list(g.forest).some((t) => FOREST.includes(t))) why.push('outside the forest: someone else\'s gap');
  const seen = new Set(), items = [];
  for (const e of list(g.evidence)) {
    if (!isObj(e)) continue;
    const host = hostOf(e.url), at = dayOf(e.date);
    if (!host || !KINDS.includes(e.kind) || Number.isNaN(at) || !str(e.said)) continue;
    if (str(e.said).split(/\s+/).length > MAX_SAID_WORDS) continue;   // a link and a short line, never a copied page
    if (at > now || now - at > MAX_AGE_DAYS * DAY) continue;
    const url = str(e.url);
    if (seen.has(url)) continue;
    seen.add(url);
    items.push({ host, kind: e.kind });
  }
  const hosts = new Set(items.map((x) => x.host)).size, kinds = new Set(items.map((x) => x.kind)).size, paying = items.filter((x) => x.kind === 'paying').length;
  if (items.length < 3) why.push('fewer than 3 usable evidence items (' + items.length + ')');
  if (hosts < 2) why.push('evidence from fewer than 2 sources (' + hosts + ')');
  if (kinds < 2 && paying < 1) why.push('one kind of evidence and nobody paying');
  return { ok: why.length === 0, why, counted: { items: items.length, hosts, kinds, paying } };
}

/** normalizeTest(spec): a demand test, whole and sealed before it opens, or refused with the reason */
export function normalizeTest(spec) {
  const s = isObj(spec) ? spec : {};
  if (!TEST_KINDS.includes(s.kind)) return { ok: false, why: 'kind must be one of ' + TEST_KINDS.join(', ') };
  if (!str(s.channel)) return { ok: false, why: 'no channel' };
  if (!METRICS.includes(s.metric)) return { ok: false, why: 'metric must be one of ' + METRICS.join(', ') };
  if (!Number.isInteger(s.bar) || s.bar < 1) return { ok: false, why: 'the bar must be a whole number of at least 1' };
  const ex = isObj(s.exposure) ? s.exposure : null;
  if (!ex || !METRICS.includes(ex.metric) || !Number.isInteger(ex.min) || ex.min < 0) return { ok: false, why: 'the exposure that makes it a real test must be a metric and a whole minimum' };
  const opens = dayOf(s.opens), closes = dayOf(s.closes), sealed = dayOf(s.sealed);
  if (Number.isNaN(opens) || Number.isNaN(closes)) return { ok: false, why: 'opens and closes must be dates' };
  if (closes < opens || closes - opens > MAX_WINDOW_DAYS * DAY) return { ok: false, why: 'the window must close on or after it opens, within ' + MAX_WINDOW_DAYS + ' days' };
  if (Number.isNaN(sealed) || sealed > opens) return { ok: false, why: 'it must be sealed on or before the day it opens' };
  if (typeof s.cost !== 'number' || !Number.isFinite(s.cost) || s.cost < 0) return { ok: false, why: 'the cost must be a number of pounds, 0 or more' };
  const simons = SIMONS.includes(s.kind) || MONEY_METRICS.includes(s.metric) || s.takesMoney === true || s.setsPrice === true;
  if (simons && !str(s.simonApproved)) return { ok: false, why: 'it takes money, sets a price or holds personal data: it needs Simon\'s approval, recorded' };
  return { ok: true, test: { kind: s.kind, channel: str(s.channel), metric: s.metric, bar: s.bar, exposure: { metric: ex.metric, min: ex.min }, opens: s.opens, closes: s.closes, sealed: s.sealed, cost: s.cost, simonApproved: simons ? str(s.simonApproved) : null } };
}

/** judge(test, result, asOf): the market's answer, from the sealed numbers alone */
export function judge(test, result, asOf) {
  const n = normalizeTest(test);
  if (!n.ok) return { ok: false, why: 'the test cannot be judged: ' + n.why };
  const t = n.test, now = dayOf(asOf);
  if (Number.isNaN(now)) return { ok: false, why: 'no date to judge on' };
  if (now <= dayOf(t.closes)) return { decision: 'OPEN', why: 'it closes ' + t.closes };
  const r = isObj(result) ? result : {};
  const got = Number.isInteger(r[t.metric]) && r[t.metric] >= 0 ? r[t.metric] : null, seen = Number.isInteger(r[t.exposure.metric]) && r[t.exposure.metric] >= 0 ? r[t.exposure.metric] : null;
  if (got === null || seen === null) return { ok: false, why: 'the result must give whole counts of ' + t.metric + ' and ' + t.exposure.metric };
  if (seen < t.exposure.min) return { decision: 'UNRUN', why: t.exposure.metric + ' ' + seen + ' is under the sealed ' + t.exposure.min + ': too few saw it to judge (not a kill)' };
  return got >= t.bar ? { decision: 'BUILD', why: t.metric + ' ' + got + ' reached the sealed bar ' + t.bar } : { decision: 'KILL', why: t.metric + ' ' + got + ' is under the sealed bar ' + t.bar };
}

/** stageOf(idea, asOf): where an idea stands */
export function stageOf(idea, asOf) {
  const i = isObj(idea) ? idea : {};
  if (!attest(i, i.scanned || asOf).ok) return 'daydream';
  if (!isObj(i.test) || !normalizeTest(i.test).ok) return 'attested';   // no test yet, or none that could be judged
  const v = judge(i.test, i.result, asOf);
  if (v.ok === false) return 'testing';   // closed, but its result is not recorded yet

  return v.decision === 'OPEN' ? 'testing' : v.decision.toLowerCase();
}

/** funnel(ideas, asOf): the counts the digest reports */
export function funnel(ideas, asOf) {
  const out = { scanned: 0, daydream: 0, attested: 0, testing: 0, build: 0, kill: 0, unrun: 0, spent: 0, killCost: 0 };
  for (const i of list(ideas)) {
    if (!isObj(i)) continue;
    out.scanned++;
    const s = stageOf(i, asOf);
    out[s]++;
    const c = isObj(i.test) && Number.isFinite(i.test.cost) ? Math.max(0, i.test.cost) : 0;
    if (s !== 'daydream' && s !== 'attested') out.spent += c;
    if (s === 'kill') out.killCost += c;
  }
  return out;
}

export default { FOREST, KINDS, TEST_KINDS, METRICS, dayOf, attest, normalizeTest, judge, stageOf, funnel };
