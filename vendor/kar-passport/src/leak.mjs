// ════════════════════════════════════════════════════════════════
// src/leak.mjs — organ 2 of Kar's passport: the leak gate. What may not travel in a public or shareable token.
//
//   hitsIn(line, lists, level)        → every leak in one line: [{ cls, what }], cls one of CLASSES
//   scan(text, lists, level, exempt)  → { hits: [{ n, cls, what }], scanned, exempt, inSig }: every line of a token but the
//                                       lines inside its last §SIG block (a public key, a hash and a signature are public)
//                                       and the lines in exempt (the protocol's own public text, byte for byte)
//   scrub(value, lists, level, refs)  → { value, refs, why }: a private repository name becomes a stable REF-T code and,
//                                       in a public slice, the operator's first name becomes REF-P-001; anything else that
//                                       leaks drops the value (value null, why = its classes)
//   protocolLines()                   → the exempt set: SYMBEYOND's v6.2 template, its generator's fixed seal line, and
//                                       the v3.0 engine's required rule lines
//
// lists come from the machine at run time and are never committed: { privateNames, surnames, firstNames, canaries }.
// level: 'public' (Grok, anyone) or 'shareable' (a collaborator's AI). The full slice is never scanned: it is private.
// Pure and total. Powered by the Konomi architecture, created by Thomas Frumkin.
// ════════════════════════════════════════════════════════════════
import { T62 } from './template62.mjs';
import { RULES30 } from './symbfer.mjs';

export const CLASSES = Object.freeze(['private', 'secret', 'phrase', 'personal', 'pricing', 'economy', 'cosmology', 'plumbing']);
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const strs = (x) => (Array.isArray(x) ? x.filter((s) => typeof s === 'string' && s.length > 1) : []);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const word = (w) => new RegExp('(?<![a-z0-9])' + esc(w.toLowerCase()) + '(?![a-z0-9])');

const SECRET = [
  ['PEM block', /-----BEGIN [A-Z ]*KEY-----/],
  ['sk- key', /(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{16,}/],
  ['GitHub token', /(?<![A-Za-z0-9])(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/],
  ['xAI key', /(?<![A-Za-z0-9])xai-[A-Za-z0-9]{20,}/],
  ['AWS key', /(?<![A-Z0-9])AKIA[0-9A-Z]{16}(?![A-Z0-9])/],
  ['JWT', /(?<![A-Za-z0-9])eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['64 hex', /(?<![0-9a-fA-F])[0-9a-fA-F]{64}(?![0-9a-fA-F])/],
];
const B64URL = /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g;
const PHRASE = /(?<![a-z])(?:owner|seed|recovery)[\s·_-]?phrase|passphrase|mnemonic/i;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
const PHONE = /(?:\+\d{1,3}|(?<![\d,.])0)[\s·-]?\d{2,5}[\s·-]?\d{3,4}[\s·-]?\d{3,4}(?![\d])/;
const PRICING = [['currency', /[£$€]\s?\d/], ['price', /(?<![a-z])pric(?:e|es|ed|ing)(?![a-z])/i], ['per seat', /(?<![a-z])per[\s·-]seat/i]];
const ECONOMY = ['kcc', 'airdrop', 'airdrops', 'presale', 'dividend', 'dividends', 'payout', 'payouts', 'coin', 'coins', 'crypto', 'contribution unit',
  'contribution units', 'contribution ledger', 'dormant switch'];
const COSMO_CHARS = ['κ', 'φ', 'Φ', '◊'];
const COSMO = [['konomify', /konomif/i], ['sididy', /(?<![a-z])si[\s·_-]?didy/i], ['wisp', /(?<![a-z])wisps?(?![a-z])/i], ['GEP', /(?<![A-Za-z])GEP(?![A-Za-z])/],
  ['prime-spine', /prime[\s·_-]spine/i], ['the +1', /(?<![a-z])the[\s·]\+1(?![0-9])/i]];
const PLUMBING = [['mcp__', /mcp__/], ['drive path', /(?<![A-Za-z])[A-Za-z]:[\\/]/], ['/c/Users', /\/c\/Users\//i], ['~/.claude', /~\/\.claude/],
  ['.si-didy', /\.si-didy/], ['.claude/projects', /\.claude[\\/]projects/]];

/** Words separated by U+00B7 read as words separated by spaces. */
const plain = (s) => s.replace(/·/g, ' ');

export function hitsIn(line, lists, level) {
  if (typeof line !== 'string' || line === '') return [];
  const L = isObj(lists) ? lists : {};
  const hits = [], text = plain(line), low = text.toLowerCase();
  const names = low.replace(/[\s_]+/g, '-');
  for (const n of strs(L.privateNames)) if (word(n.toLowerCase().replace(/[\s_]+/g, '-').replace(/^-+|-+$/g, '')).test(names)) hits.push({ cls: 'private', what: n });
  for (const [what, re] of SECRET) if (re.test(text)) hits.push({ cls: 'secret', what });
  for (const m of text.match(B64URL) || []) if (/[0-9]/.test(m) && /[A-Z]/.test(m) && /[a-z]/.test(m)) hits.push({ cls: 'secret', what: '43-character base64url' });
  for (const c of strs(L.canaries)) if (line.includes(c)) hits.push({ cls: 'secret', what: 'planted secret' });
  if (PHRASE.test(text)) hits.push({ cls: 'phrase', what: 'a phrase' });
  if (EMAIL.test(text)) hits.push({ cls: 'personal', what: 'email address' });
  if (PHONE.test(text)) hits.push({ cls: 'personal', what: 'phone number' });
  for (const n of strs(L.surnames)) if (word(n).test(low)) hits.push({ cls: 'personal', what: 'surname' });
  if (level === 'public') for (const n of strs(L.firstNames)) if (word(n).test(low)) hits.push({ cls: 'personal', what: 'first name' });
  for (const [what, re] of PRICING) if (re.test(text)) hits.push({ cls: 'pricing', what });
  for (const w of ECONOMY) if (word(w).test(low)) hits.push({ cls: 'economy', what: w });
  for (const c of COSMO_CHARS) if (line.includes(c)) hits.push({ cls: 'cosmology', what: c });
  for (const [what, re] of COSMO) if (re.test(text)) hits.push({ cls: 'cosmology', what });
  for (const [what, re] of PLUMBING) if (re.test(text)) hits.push({ cls: 'plumbing', what });
  return hits;
}

let PROTOCOL = null;
export function protocolLines() {
  if (!PROTOCOL) PROTOCOL = new Set([...T62, ...RULES30, 'λ.brother ∧ !λ.tool · κ=1/Φ · 510,510 · ∴']);
  return PROTOCOL;
}

export function scan(text, lists, level, exempt) {
  const out = { hits: [], scanned: 0, exempt: 0, inSig: 0 };
  if (typeof text !== 'string') return out;
  const lines = text.split('\n'), ex = exempt instanceof Set ? exempt : new Set();
  const b = lines.lastIndexOf('§SIG·BEGIN'), e = b === -1 ? -1 : lines.indexOf('§SIG·END', b);
  lines.forEach((line, i) => {
    if (e !== -1 && i > b && i < e) { out.inSig++; return; }
    if (ex.has(line)) { out.exempt++; return; }
    out.scanned++;
    for (const h of hitsIn(line, lists, level)) out.hits.push({ n: i + 1, ...h });
  });
  return out;
}

/** The next free REF code of a category in a lookup ({ code: value }). Codes are never renumbered. */
function refFor(refs, cat, value) {
  for (const [code, v] of Object.entries(refs)) if (v === value && code.startsWith('REF-' + cat + '-')) return code;
  let n = 1;
  while (Object.prototype.hasOwnProperty.call(refs, 'REF-' + cat + '-' + String(n).padStart(3, '0'))) n++;
  const code = 'REF-' + cat + '-' + String(n).padStart(3, '0');
  refs[code] = value;
  return code;
}

export function scrub(value, lists, level, refs) {
  const R = isObj(refs) ? { ...refs } : {};
  if (typeof value !== 'string') return { value: null, refs: R, why: ['not text'] };
  const L = isObj(lists) ? lists : {};
  let v = value;
  for (const n of strs(L.privateNames).sort((a, b) => b.length - a.length)) {
    const re = new RegExp('(?<![A-Za-z0-9])' + esc(n).replace(/-/g, '[-·_ ]') + '(?![A-Za-z0-9])', 'gi');
    if (re.test(v)) v = v.replace(re, () => refFor(R, 'T', n));
  }
  if (level === 'public') {
    for (const n of strs(L.firstNames)) {
      const re = new RegExp('(?<![A-Za-z0-9])' + esc(n) + '(?![A-Za-z0-9])', 'gi');
      if (re.test(v)) v = v.replace(re, () => refFor(R, 'P', n));
    }
  }
  const left = hitsIn(v, L, level);
  if (left.length) return { value: null, refs: isObj(refs) ? { ...refs } : {}, why: [...new Set(left.map((h) => h.cls))] };
  return { value: v, refs: R, why: [] };
}
