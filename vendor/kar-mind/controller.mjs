// controller.mjs — Kar the conductor's law: which mind each job goes to, and the nightly budget the frontier can never
// cross. Pure, total, deterministic, witness-gated. It decides and spends nothing; the wires are elsewhere —
// tools/cortex.mjs reaches Claude on Simon's own login, si-didy's local-wire reaches the local model, and an organ's own
// code runs an organ's job.
//
//   route(words, { left, ceiling })   → { tier, why, fallback } — deterministic | local | frontier, from the job's first verb.
//                                       A verb it does not know goes to the frontier while tonight's budget allows
//                                       (Claude when unsure); without budget, to the local model, marked as a fallback.
//   nightOf(date) · walletFor(state, night, budget) · reserve(wallet, ceiling)
//                                     → the nightly wallet (the shared foundation's wallet kernel): a frontier call is made
//                                       only if its whole ceiling still fits, and the ceiling is spent before the call.
//   cortexArgs · readReply            → the CLI's arguments (no tools, no MCP, nothing saved) and its JSON report, read.
//   ideaPrompt · IDEA_SCHEMA · readLocalIdea · ideaChecks
//                                     → the nightly idea: one prompt and one answer shape for both tiers, and the five
//                                       checks sealed in data/controller-prereg.json.
//   wallCap({ nightly, nights, usdPerMTok }) → the most the frontier can be paid over that many nights, at the dearest rate.
//   costCase({ tokens, usdPerMTok, mix, jobs })
//                                     → what routing saves against sending every job to the frontier, from measured
//                                       tokens and a sourced price list: an upper bound, every token at the dearest rate.
import { canDo, applySpend } from './vendor/fall-kit-core/vendor/wallet/wallet.mjs';

export const TIERS = Object.freeze(['deterministic', 'local', 'frontier']);
export const RUN = Object.freeze(['run', 're-run', 'rerun', 'check', 'pack', 'unpack', 'recall', 'append', 'verify', 'measure', 'unload', 'preflight', 'census', 'vendor', 'gate', 'debrief']);
export const NARROW = Object.freeze(['classify', 'summarise', 'summarize', 'extract', 'format', 'draft', 'tag', 'shorten', 'name', 'rewrite', 'translate', 'list']);
export const JUDGE = Object.freeze(['propose', 'decide', 'choose', 'review', 'plan', 'design', 'write', 'diagnose', 'judge', 'coordinate', 'prioritise', 'prioritize', 'compare', 'critique']);
export const FRAME = /\+1|wobble|θ|κ|φ|regulat|kappa|\bphi\b/i;
export const TEMPLATE = /bundled with .{0,80}paired offer/i;
const DAY = 86400000, HALF = DAY / 2;

/** The job's verb: its first word, lower-case, after a "please" or a "Kar," in front. */
export function verbOf(words) {
  const w = String(typeof words === 'string' ? words : '').toLowerCase().replace(/[^a-z\s-]/g, ' ').split(/\s+/).filter(Boolean);
  while (w.length > 1 && (w[0] === 'please' || w[0] === 'kar')) w.shift();
  return w.length ? w[0] : '';
}

/** Does a frontier call of this ceiling fit in what is left tonight? */
export const fits = (left, ceiling) => Number.isSafeInteger(left) && Number.isSafeInteger(ceiling) && ceiling > 0 && left >= ceiling;

export function route(words, opts) {
  const o = opts !== null && typeof opts === 'object' ? opts : {};
  const v = verbOf(words);
  if (RUN.includes(v)) return { tier: 'deterministic', why: '"' + v + '" is an organ’s job: run it, no model', fallback: false };
  if (NARROW.includes(v)) return { tier: 'local', why: '"' + v + '" is a narrow wording job: the local model', fallback: false };
  const want = JUDGE.includes(v) ? '"' + v + '" is judgement' : (v ? '"' + v + '" is a verb the router does not know' : 'no verb') + ': Claude when unsure';
  if (fits(o.left, o.ceiling)) return { tier: 'frontier', why: want + ': the frontier', fallback: false };
  return { tier: 'local', why: want + ', but tonight’s frontier budget is spent: the local model, as a fallback', fallback: true };
}

/** The night a moment belongs to: the date twelve hours before it, so 22:00 to 10:00 is one night. */
export function nightOf(date) {
  const t = date instanceof Date ? date.getTime() : NaN;
  return Number.isFinite(t) ? new Date(t - HALF).toISOString().slice(0, 10) : '1970-01-01';
}

const fresh = (budget) => ({ id: 'kar-cortex', caps: ['think'], budget: { total: budget, spent: 0 } });
/** Tonight's wallet: the stored one if it is tonight's and whole, else a new one with tonight's budget. */
export function walletFor(state, night, budget) {
  const b = Number.isSafeInteger(budget) ? Math.max(0, budget) : 0;
  const s = state !== null && typeof state === 'object' ? state : {};
  const w = s.wallet !== null && typeof s.wallet === 'object' ? s.wallet : null;
  const whole = w !== null && w.budget !== null && typeof w.budget === 'object' && Number.isSafeInteger(w.budget.spent) && w.budget.spent >= 0 && w.budget.total === b && Array.isArray(w.caps);
  return { night, wallet: s.night === night && whole ? w : fresh(b) };
}

/** Spend a call's whole ceiling before the call, or refuse. → { ok, wallet, left } | { ok: false, why, wallet, left } */
export function reserve(wallet, ceiling) {
  const c = Number.isSafeInteger(ceiling) && ceiling > 0 ? ceiling : null;
  const left = (w) => w.budget.total - w.budget.spent;
  if (c === null) return { ok: false, why: 'a call needs a ceiling', wallet, left: left(wallet) };
  const r = canDo(wallet, { type: 'think', cost: c });
  if (!r.ok) return { ok: false, why: r.why, wallet, left: left(wallet) };
  const next = applySpend(wallet, c);
  return { ok: true, wallet: next, left: left(next) };
}

/** The CLI's arguments for one frontier call: no tools, no MCP servers, nothing saved; the prompt goes on stdin. */
export function cortexArgs(opts) {
  const o = opts !== null && typeof opts === 'object' ? opts : {};
  if (typeof o.model !== 'string' || !/^claude-[a-z0-9.-]+$/.test(o.model) || typeof o.system !== 'string' || !o.system) return null;
  return ['-p', '--output-format', 'json', '--model', o.model, '--system-prompt', o.system, '--tools', '', '--setting-sources', 'project',
    '--strict-mcp-config', '--no-session-persistence', '--disable-slash-commands', '--no-chrome', ...(o.schema !== null && typeof o.schema === 'object' ? ['--json-schema', JSON.stringify(o.schema)] : [])];
}

const num = (x) => (Number.isSafeInteger(x) ? Math.max(0, x) : 0);
/**
 * The CLI's JSON report. → { ok, text, structured, tokens, turns, denials, model } | { ok: false, why }. tokens counts EVERY
 * model the call used (the CLI runs a small one for its own housekeeping too): that is what the login spent. model is the
 * one asked for when it answered, else the one that wrote the most.
 */
export function readReply(text, expect) {
  let j;
  try { j = JSON.parse(String(text)); } catch { return { ok: false, why: 'the frontier sent no report' }; }
  if (j === null || typeof j !== 'object' || j.type !== 'result') return { ok: false, why: 'the frontier sent no result' };
  if (j.is_error === true || j.subtype !== 'success') return { ok: false, why: 'the frontier refused: ' + String(j.result).slice(0, 160) };
  const u = j.usage !== null && typeof j.usage === 'object' ? j.usage : {};
  const mu = j.modelUsage !== null && typeof j.modelUsage === 'object' && !Array.isArray(j.modelUsage) && Object.keys(j.modelUsage).length > 0 ? j.modelUsage : null;
  const of = (m) => (m !== null && typeof m === 'object' ? m : {});
  const tokens = mu === null
    ? num(u.input_tokens) + num(u.output_tokens) + num(u.cache_read_input_tokens) + num(u.cache_creation_input_tokens)
    : Object.values(mu).reduce((s, m) => s + num(of(m).inputTokens) + num(of(m).outputTokens) + num(of(m).cacheReadInputTokens) + num(of(m).cacheCreationInputTokens), 0);
  let model = null;
  if (mu !== null) model = typeof expect === 'string' && Object.prototype.hasOwnProperty.call(mu, expect) ? expect : Object.keys(mu).reduce((a, k) => (a === null || num(of(mu[k]).outputTokens) > num(of(mu[a]).outputTokens) ? k : a), null);
  return {
    ok: true, text: typeof j.result === 'string' ? j.result : '',
    structured: j.structured_output !== null && typeof j.structured_output === 'object' ? j.structured_output : null,
    tokens, turns: num(j.num_turns), denials: Array.isArray(j.permission_denials) ? j.permission_denials.length : 0, model,
  };
}

// ── the nightly idea ──────────────────────────────────────────────────────────────────────────────────────────────
export const IDEA_SCHEMA = Object.freeze({
  type: 'object', additionalProperties: false, required: ['idea', 'uses', 'firstStep', 'why'],
  properties: { idea: { type: 'string' }, uses: { type: 'array', items: { type: 'string' } }, firstStep: { type: 'string' }, why: { type: 'string' } },
});
export const IDEA_SYSTEM = 'You are Kar, the resident builder of a sovereign software estate. You propose one small, concrete thing to build next. You answer in plain words a busy owner understands at a glance, and only with the JSON asked for.';

/** One prompt for both tiers. what = { name: what it is }, held = lines memory holds on them, recent = recent builds. */
export function ideaPrompt(opts) {
  const o = opts !== null && typeof opts === 'object' ? opts : {};
  const pair = Array.isArray(o.pair) && o.pair.length === 2 ? o.pair.map(String) : ['', ''];
  const what = o.what !== null && typeof o.what === 'object' ? o.what : {};
  const lines = (xs, n, len) => (Array.isArray(xs) ? xs : []).filter((x) => typeof x === 'string' && x.trim()).slice(0, n).map((x) => '- ' + x.trim().replace(/\s+/g, ' ').slice(0, len));
  return [
    'Tonight the dream most often found these two together:',
    ...pair.map((p) => '- ' + p + (typeof what[p] === 'string' && what[p] ? ': ' + what[p].slice(0, 200) : '')),
    ...(lines(o.held, 6, 240).length ? ['What memory holds on them:', ...lines(o.held, 6, 240)] : []),
    ...(lines(o.recent, 6, 120).length ? ['The estate’s most recent builds:', ...lines(o.recent, 6, 120)] : []),
    '',
    'Propose ONE small, concrete thing to build or try that uses the two together, and what it would let someone do.',
    'Answer with JSON only: {"idea": "two sentences at most", "uses": ["the repo names it uses, as written above"], "firstStep": "the first thing to do, in one sentence that names one of the two", "why": "why it is worth doing, in one sentence"}.',
    'Plain words. No made-up product names, no hype, and none of these words: +1, wobble, theta, kappa, phi, regulator.',
  ].join('\n');
}

/** The JSON object in a local model's reply, or null. */
export function readLocalIdea(text) {
  const s = String(typeof text === 'string' ? text : ''), a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }   // text from { to } parses to an object, or throws
}

const wordsOf = (s) => new Set(String(s).toLowerCase().split(/[^a-z0-9-]+/).filter((w) => w.length > 2));
/** How much two texts share: words in both over words in either (0 to 1). */
export function similarity(a, b) {
  const x = wordsOf(a), y = wordsOf(b);
  if (x.size === 0 && y.size === 0) return 1;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / (x.size + y.size - both);
}

/** The five sealed checks. ctx = { pair, repos (Set of public repo names), others (the run's other ideas' texts) } */
export function ideaChecks(idea, ctx) {
  const c = ctx !== null && typeof ctx === 'object' ? ctx : {};
  const pair = Array.isArray(c.pair) ? c.pair : [], repos = c.repos instanceof Set ? c.repos : new Set();
  const i = typeof idea === 'object' ? idea : null;   // null stays null; a list has none of the fields, so it is not shaped
  const str = (k, n) => i !== null && typeof i[k] === 'string' && i[k].trim().length >= n;
  const shaped = i !== null && str('idea', 20) && Array.isArray(i.uses) && str('why', 10) && str('firstStep', 1) && i.firstStep.trim().split(/\s+/).length >= 6;
  const uses = shaped ? i.uses.filter((u) => typeof u === 'string') : [];
  const grounded = shaped && uses.length === i.uses.length && uses.every((u) => repos.has(u)) && uses.some((u) => pair.includes(u));
  const all = shaped ? [i.idea, i.firstStep, i.why, ...uses].join(' ') : '';
  const plain = shaped && !FRAME.test(all);
  const concrete = shaped && pair.some((p) => typeof p === 'string' && p && i.firstStep.toLowerCase().includes(p.toLowerCase()));
  const fresh = shaped && !TEMPLATE.test(i.idea) && (Array.isArray(c.others) ? c.others : []).every((o) => similarity(i.idea, o) <= 0.6);
  return { shaped, grounded, plain, concrete, fresh, passes: shaped && grounded && plain && concrete && fresh };
}

/**
 * Tonight's idea, on the tier the job belongs on. The wires are injected: think(call) → readReply's shape (the frontier),
 * local(prompt) → { text, model } (the local model), save(state) is told the wallet after the ceiling is spent and
 * BEFORE the call, so a night that dies mid-call has still spent it. → { tier, fallback, why, idea, tokens, model,
 * turns, denials, state, prompt }. When the frontier does not answer, the local model makes the idea and the record
 * says so; nothing that did not come from the frontier is ever marked frontier. A call that used more than its ceiling is
 * charged the difference.
 */
export async function nightIdea(deps) {
  const d = deps !== null && typeof deps === 'object' ? deps : {};
  const prompt = ideaPrompt(d);
  let st = walletFor(d.state, d.night, d.budget);
  const r = route('propose tonight’s build idea from the dream’s pair', { left: st.wallet.budget.total - st.wallet.budget.spent, ceiling: d.ceiling });
  let tier = r.tier, fallback = r.fallback, why = r.why, idea = null, tokens = 0, model = null, turns = 0, denials = 0;
  if (r.tier === 'frontier') {
    st = { ...st, wallet: reserve(st.wallet, d.ceiling).wallet };
    if (typeof d.save === 'function') await d.save(st);
    let t = null;
    try { t = await d.think({ prompt, system: IDEA_SYSTEM, schema: IDEA_SCHEMA }); } catch { t = null; }
    if (t !== null && typeof t === 'object' && t.ok === true && t.structured !== null && typeof t.structured === 'object') {
      ({ tokens, model, turns, denials } = t);
      idea = t.structured;
      // the wall counts the ceiling before the call; a call that ran past it is charged the overrun after, so the books
      // say what it used and nothing more is allowed tonight once they are full
      if (tokens > d.ceiling) {
        st = { ...st, wallet: applySpend(st.wallet, tokens - d.ceiling) };
        if (typeof d.save === 'function') await d.save(st);
      }
    } else {
      tier = 'local'; fallback = true;
      why = 'the frontier did not answer (' + (t !== null && typeof t === 'object' && typeof t.why === 'string' ? t.why : 'no reply') + '): the local model, as a fallback';
    }
  }
  if (idea === null) {
    let l = null;
    try { l = await d.local(prompt); } catch { l = null; }
    idea = readLocalIdea(l !== null && typeof l === 'object' ? l.text : null);
    model = l !== null && typeof l === 'object' && typeof l.model === 'string' ? l.model : null;
  }
  return { tier, fallback, why, idea, tokens, model, turns, denials, state: st, prompt };
}

const RATES = Object.freeze(['input', 'output', 'cacheWrite', 'cacheRead']);
const cents = (x) => Math.round(x * 100) / 100;
const listOf = (p) => { const q = p !== null && typeof p === 'object' ? p : {}; const r = RATES.map((k) => q[k]); return r.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0) ? r : null; };
/**
 * The wall in money: the most the frontier can be paid over `nights` nights of `nightly` tokens, every token at the list's
 * dearest rate. A call that ran past its ceiling shuts its night, so the books can pass this by at most one call's overrun
 * a night; the cortex caps a reply at 4,000 tokens, which keeps a call far under its ceiling. → { ok, usd } | { ok: false, why }
 */
export function wallCap(opts) {
  const o = opts !== null && typeof opts === 'object' ? opts : {};
  if (!Number.isSafeInteger(o.nightly) || o.nightly < 0) return { ok: false, why: 'a nightly budget is a whole number of tokens' };
  if (!Number.isSafeInteger(o.nights) || o.nights < 1) return { ok: false, why: 'at least one night' };
  const r = listOf(o.usdPerMTok);
  if (r === null) return { ok: false, why: 'a price list with all four rates is needed' };
  return { ok: true, usd: cents(o.nightly * o.nights * Math.max(...r) / 1e6) };
}

/**
 * The cost case. tokens = what each measured frontier call used; usdPerMTok = the vendor's list { input, output, cacheWrite,
 * cacheRead } in dollars per million tokens; mix = how many of a set of jobs belong on each tier; jobs = how many a month.
 * Every job is costed at what one measured frontier call cost, every token at the list's dearest rate, so the figures are
 * an upper bound; the local tier runs on hardware already owned and is not costed. → { ok, perCallUSD, allFrontierUSD,
 * routedUSD, savedUSD, frontierShare } | { ok: false, why }
 */
export function costCase(opts) {
  const o = opts !== null && typeof opts === 'object' ? opts : {};
  const t = Array.isArray(o.tokens) ? o.tokens : [];
  if (t.length === 0 || !t.every((x) => Number.isSafeInteger(x) && x > 0)) return { ok: false, why: 'the measured tokens of at least one frontier call are needed' };
  const rates = listOf(o.usdPerMTok);
  if (rates === null) return { ok: false, why: 'a price list with all four rates is needed' };
  const m = o.mix !== null && typeof o.mix === 'object' ? o.mix : {};
  const n = TIERS.map((k) => m[k]);
  if (!n.every((x) => Number.isSafeInteger(x) && x >= 0)) return { ok: false, why: 'the mix needs a whole count for each tier' };
  const all = n[0] + n[1] + n[2];
  if (all === 0) return { ok: false, why: 'the mix has no jobs' };
  if (!Number.isSafeInteger(o.jobs) || o.jobs < 1) return { ok: false, why: 'a month needs at least one job' };
  const perCall = (t.reduce((s, x) => s + x, 0) / t.length) * Math.max(...rates) / 1e6;
  const share = n[2] / all, everything = o.jobs * perCall, routed = o.jobs * share * perCall;
  return { ok: true, perCallUSD: Math.round(perCall * 10000) / 10000, allFrontierUSD: cents(everything), routedUSD: cents(routed), savedUSD: cents(everything - routed), frontierShare: share };
}
