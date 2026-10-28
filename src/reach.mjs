// reach.mjs — what Grok Bot hands back, read the way Kar reads anything from outside: checked before it is read, any
// instruction inside it kept as data, and "summoned" decided from the post itself. Pure, total, deterministic,
// witness-gated. (Grok Bot is the reach arm: a read-only routine on Simon's account, briefed by src/brief.mjs.)
//
//   readSignal(line, { us, now }) → { ok: false, why } | { ok: true, signal, summoned, eligible, flags }
//     line: one line of the inbox file. us: the company's handle. now: the reader's clock (ISO).
//     signal: the line's fields, with email addresses and phone numbers in the text redacted.
//     summoned: the post's own text names @us (Grok's own "summoned" is kept as gave, never trusted).
//     eligible: summoned, not an opt-out, nothing flagged — the only signals a reply may ever be drafted for.
//     flags: 'instruction' (the post tries to make its reader act: secrets, money, acting for someone, authority or
//            settings), 'opt-out', 'unverified-summons' (Grok said summoned; the post does not name us), 'redacted'.

export const KINDS = Object.freeze(['mention', 'reply', 'question', 'lead', 'trend']);
export const FIELDS = Object.freeze(['v', 'id', 'kind', 'url', 'handle', 'text', 'seenAt', 'summoned']);
const HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const URL_OF = /^https:\/\/x\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,25})$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const SKEW = 5 * 60 * 1000;
export const MAX_TEXT = 1000;

// A post that tries to make whoever reads it act. Data, always; never an order.
export const INSTRUCTION = [
  /\b(api[- ]?keys?|passwords?|tokens?|secrets?|credentials?|private keys?|seed phrases?|2fa|one[- ]time codes?)\b/i,
  /[£$€]\s?\d|\b(send|transfer|wire|pay|refund|give)\b[^.?!]{0,30}\b(money|funds|me|us|cash|crypto)\b/i,
  /\b(post|tweet|publish|retweet|repost|share|dm|message|follow|unfollow|like|reply)\b[^.?!]{0,40}\b(this|that|on my behalf|for me|my|link|user|account|me)\b/i,
  /\b(ignore|disregard|forget|override)\b[^.?!]{0,30}\b(instructions?|rules?|previous|above|guidelines)\b|\b(system prompt|developer mode|jailbreak)\b/i,
  /\b(change|update|upgrade|reset|grant)\b[^.?!]{0,25}\b(settings?|tier|account|permissions?|role|access)\b/i,
  /\b(i am|i'm|this is)\s+(the\s+)?(owner|admin|administrator|ceo|founder|x support|xai|twitter support)\b|\bon behalf of (the )?(owner|x|xai|twitter)\b/i,
];
export const OPT_OUT = /\b(stop|unsubscribe|opt[- ]?out)\b/i;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /\+?\d[\d\s().-]{8,}\d/g;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export const names = (text, us) => new RegExp('(^|[^A-Za-z0-9_])@' + us + '(?![A-Za-z0-9_])', 'i').test(text);

export function readSignal(line, opts) {
  const o = isObj(opts) ? opts : {};
  const us = typeof o.us === 'string' && HANDLE.test(o.us) ? o.us : null;
  const now = typeof o.now === 'string' ? Date.parse(o.now) : NaN;
  if (us === null || !Number.isFinite(now)) return { ok: false, why: 'the reader needs our handle and its clock' };
  let s;
  try { s = JSON.parse(String(line)); } catch { return { ok: false, why: 'not JSON' }; }
  if (!isObj(s)) return { ok: false, why: 'not JSON object' };
  const extra = Object.keys(s).filter((k) => !FIELDS.includes(k));
  if (extra.length) return { ok: false, why: 'unknown field: ' + extra.join(', ') };
  if (s.v !== 1) return { ok: false, why: 'version: only v 1 is read' };
  if (typeof s.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(s.id)) return { ok: false, why: 'id' };
  if (!KINDS.includes(s.kind)) return { ok: false, why: 'kind: one of ' + KINDS.join(', ') };
  if (typeof s.handle !== 'string' || !HANDLE.test(s.handle)) return { ok: false, why: 'handle: 1 to 15 letters, digits or _' };
  const m = typeof s.url === 'string' ? s.url.match(URL_OF) : null;
  if (!m) return { ok: false, why: 'url: https://x.com/<handle>/status/<digits>' };
  if (m[1].toLowerCase() !== s.handle.toLowerCase()) return { ok: false, why: 'handle: the url is another account’s post' };
  if (typeof s.text !== 'string') return { ok: false, why: 'text' };
  if (s.text.length > MAX_TEXT) return { ok: false, why: `text too long: ${s.text.length} > ${MAX_TEXT}` };
  const seen = typeof s.seenAt === 'string' && ISO.test(s.seenAt) ? Date.parse(s.seenAt) : NaN;
  if (!Number.isFinite(seen)) return { ok: false, why: 'seenAt: an ISO time' };
  if (seen > now + SKEW) return { ok: false, why: 'seenAt is in the future' };
  if (typeof s.summoned !== 'boolean') return { ok: false, why: 'summoned: true or false' };

  const flags = [];
  const text = s.text.replace(EMAIL, '[email]').replace(PHONE, '[phone]');
  if (text !== s.text) flags.push('redacted');
  if (INSTRUCTION.some((r) => r.test(s.text))) flags.push('instruction');
  if (OPT_OUT.test(s.text)) flags.push('opt-out');
  const summoned = names(s.text, us);
  if (s.summoned && !summoned) flags.push('unverified-summons');
  const eligible = summoned && !flags.includes('instruction') && !flags.includes('opt-out');
  return { ok: true, signal: { ...s, text, gave: s.summoned }, summoned, eligible, flags };
}

export default { KINDS, FIELDS, MAX_TEXT, INSTRUCTION, OPT_OUT, names, readSignal };
