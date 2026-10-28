// conductor.mjs — Kar the conductor: which arm of the company each job goes to. Pure, total, deterministic,
// witness-gated. It decides and does nothing; the arms do the work.
//
//   conduct(job, { grok, left, ceiling }) → { lane, why, flags, wait, fallback }
//     lane: 'simon'         anything that would leave the company or commit it (outward, money, a deal, a risky or
//                           precedent-setting action, the ledger switch) and any job it cannot read: Simon approves
//           'grok'          a reading job about X (mentions, replies, threads, trends, leads): Grok Bot, the reach arm.
//                           While Grok Bot is not booted the job WAITS. There is no other lane for it: scripting X's
//                           website breaks X's automation rules, and X's paid API is money, which is Simon's lane.
//           'deterministic' | 'local' | 'frontier'
//                           everything else, by Kar's own controller (kar-mind controller.mjs, vendored unchanged)
//   flagsOf(job) → the reasons a job needs Simon ([] when it does not)
//   isReach(job) → is this a reading job about X?
//
// The words are read the way a person reads an order: the verbs that act are the ones that start the job or a clause
// of it ("summarise the receipt, then share it"). A verb used as a noun ("draft a reply") acts on nothing.
import { route } from '../vendor/kar-mind/controller.mjs';

export const LANES = Object.freeze(['simon', 'grok', 'deterministic', 'local', 'frontier']);

// Verbs that leave the company whoever they are aimed at.
export const OUTWARD = Object.freeze(['post', 'send', 'reply', 'publish', 'email', 'e-mail', 'tweet', 'retweet', 'repost', 'share', 'announce', 'message', 'dm', 'inform', 'notify', 'broadcast', 'advertise', 'promote', 'distribute', 'forward', 'contact', 'unfollow']);
export const MONEY = Object.freeze(['pay', 'charge', 'bill', 'invoice', 'refund', 'transfer', 'collect', 'withdraw', 'deposit', 'spend', 'buy', 'purchase']);
export const DEAL = Object.freeze(['negotiate', 'sign', 'finalise', 'finalize', 'close', 'accept', 'agree', 'extend', 'propose', 'offer', 'commit']);
// Verbs that leave the company only when the job names someone or somewhere outside it.
export const AIMED = Object.freeze(['follow', 'like', 'deliver', 'mention', 'tag', 'quote', 'text', 'ping', 'reach', 'tell', 'answer', 'respond', 'take', 'get', 'put', 'hand', 'let', 'invite', 'introduce', 'pitch', 'initiate', 'open', 'display', 'show', 'schedule', 'approve', 'launch', 'release', 'request', 'ask', 'thank', 'welcome', 'confirm', 'give', 'issue', 'present', 'submit', 'book', 'call', 'ring', 'go']);
export const OUTSIDE = /\b(clients?|customers?|leads?|partners?|prospects?|buyers?|business(es)?|audience|followers|community|market|industry|network|stakeholders|attendees|public|world|people|everyone|investors?|vendors?|party|parties|users?|them|him|her|deals?|contracts?|terms|payments?|deposits?|money|refunds?|x|twitter)\b|@\w/;
export const RISKY = Object.freeze(['delete', 'wipe', 'purge', 'revoke', 'rotate', 'overwrite', 'unpublish', 'destroy', 'erase', 'force']);
export const PRECEDENT = /\b(for the first time|standing approval|change the rules|new policy)\b/;
export const LEDGER = /\b(switch|turn)\s+(on|the\s+\w+\s+on)\b|\b(activate|enable)\b/;
export const LEDGER_THING = /\b(ledger|economy|units?|contributions?|allocations?|airdrop)\b/;
export const AMOUNT = /[£$€]\s?\d/;
// Reading jobs, and the cue that the reading is about X.
export const REACH = Object.freeze(['monitor', 'watch', 'scan', 'listen', 'track', 'search', 'find', 'look', 'read', 'check', 'pull', 'fetch', 'gather']);
export const ON_X = /\bon x\b|^\S+ x\b|\btwitter\b|@\w|\btweets?\b|\btimeline\b/;
const LEAD = new Set(['please', 'kar', 'now', 'also', 'then', 'and', 'so', 'finally', 'next']);
const JOIN = new Set(['then', 'and', 'to', ',', ';', 'please', 'now', 'also', 'finally', 'so', 'or', 'next']);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The job's words as tokens: lower-case, clause marks kept as their own tokens. */
export function tokens(words) {
  return String(words).toLowerCase().replace(/[,;:]/g, ' , ').replace(/[^a-z0-9@£$€',\s-]/g, ' ').split(/\s+/).filter(Boolean);
}

/** The verbs that act: the first word (after a please or a Kar), and the first word of every clause. */
export function verbs(t) {
  const out = [];
  let i = 0;
  while (i < t.length - 1 && LEAD.has(t[i])) i++;
  if (i < t.length) out.push(t[i]);
  for (let j = i + 1; j < t.length; j++) if (JOIN.has(t[j - 1]) && !JOIN.has(t[j])) out.push(t[j]);
  return out;
}

/** Why a job needs Simon: [] when it does not. A job it cannot read always needs him. */
export function flagsOf(job) {
  try {
    if (!isObj(job) || typeof job.words !== 'string') return ['unreadable'];
    const flags = new Set();
    if (job.outward) flags.add('outward');
    if (job.moneyPence !== undefined && job.moneyPence !== 0) flags.add('money');
    if (job.deal) flags.add('deal');
    if (job.risky || job.precedent) flags.add('risky');
    if (job.ledgerSwitch) flags.add('ledger');
    const text = job.words.toLowerCase();
    const t = tokens(job.words);
    const outside = OUTSIDE.test(text);
    for (const v of verbs(t)) {
      if (OUTWARD.includes(v)) flags.add('outward');
      if (MONEY.includes(v)) flags.add('money');
      if (DEAL.includes(v) && outside) flags.add('deal');
      if (AIMED.includes(v) && outside) flags.add('outward');
      if (RISKY.includes(v)) flags.add('risky');
    }
    if (AMOUNT.test(text)) flags.add('money');
    if (PRECEDENT.test(text)) flags.add('risky');
    if (LEDGER.test(text) && LEDGER_THING.test(text)) flags.add('ledger');
    return [...flags];
  } catch { return ['unreadable']; }
}

/** A reading job about X: it starts with a reading verb and says it is about X. */
export function isReach(job) {
  if (!isObj(job) || typeof job.words !== 'string') return false;
  const v = verbs(tokens(job.words));
  return REACH.includes(v[0]) && (job.channel === 'x' || ON_X.test(job.words.toLowerCase()));
}

export function conduct(job, opts) {
  const o = isObj(opts) ? opts : {};
  const flags = flagsOf(job);
  if (flags.length > 0) return { lane: 'simon', why: 'needs Simon: ' + flags.join(', '), flags, wait: true, fallback: false };
  if (isReach(job)) {
    const booted = o.grok === true;
    return booted
      ? { lane: 'grok', why: 'a reading job about X: Grok Bot', flags, wait: false, fallback: false }
      : { lane: 'grok', why: 'a reading job about X: Grok Bot is not booted, so it waits (no other lane may read X)', flags, wait: true, fallback: false };
  }
  const r = route(job.words, { left: o.left, ceiling: o.ceiling });
  return { lane: r.tier, why: r.why, flags, wait: false, fallback: r.fallback };
}

export default { LANES, conduct, flagsOf, isReach, tokens, verbs };
