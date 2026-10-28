// ════════════════════════════════════════════════════════════════
// src/seal.mjs — organ 1 of Kar's passport (with symbfer.mjs and render.mjs): seal, verify, and verify-before-parse.
//
//   seal(text, identity)          → the token with its §SIG block sealed: SHA-256 of canonical(text), and Ed25519 (the
//                                   identity's key, fall-kit's identity.mjs) over sealMessage(sha); '' if it has no §SIG
//   verify(text, { trust })       → { ok: true, format, key, sha } | { ok: false, why }. In order: a SYMB-FER shape this
//                                   codec reads; the §SIG block sealed; LF only; the shape's own validator says PASS
//                                   (SYMBEYOND's for v6.2, teslasolar's engine for v3.0, the generator's limit for a tier);
//                                   the SHA-256 matches; the key is on the trust list; the signature verifies
//   verifyBytes(u8, opts)         → the same, on raw bytes (not UTF-8 is a refusal)
//   parseToken(text, { trust })   → verify first; a refused token gives { ok: false, refused, context: null } and nothing
//                                   of its content. A verified one gives its context: the model (v6.2, v3.0) or the
//                                   generator's text (a tier), and the v6.2 boot protocol's steps in its own order.
//
// Async only because WebCrypto is. Never throws. Powered by the Konomi architecture, created by Thomas Frumkin.
// ════════════════════════════════════════════════════════════════
import { sha256 } from '../vendor/fall-kit-core/vendor/light/sha256.mjs';
import { verifyBytes as edVerify, hex, unhex } from '../vendor/fall-kit-core/identity.mjs';
import { canonical, sigOf, withSig, sealMessage, formatOf, validate62, validate30, tierBody, codePoints, TIER_LIMITS, decodeUtf8 } from './symbfer.mjs';
import { toModel62, toModel30 } from './render.mjs';

const enc = new TextEncoder();
export const shaOf = (text) => hex(sha256(enc.encode(typeof text === 'string' ? text : '')));
const no = (why) => ({ ok: false, why });

export async function seal(text, identity) {
  try {
    const body = canonical(text);
    if (body === null) return '';
    const sha = shaOf(body);
    const sig = hex(await identity.sign(sealMessage(sha)));
    return withSig(text, { sha, key: identity.id, sig });
  } catch { return ''; }
}

/** The shape check alone: which format, and does its own validator pass it. */
export function shapeOf(text) {
  const format = formatOf(text);
  if (!format) return no('not a SYMB-FER shape this codec reads (v6.2, v3.0, or a NANO, CORE or STATE tier)');
  if (text.includes('\r')) return no('carriage return: SYMB-FER tokens are LF only');
  if (format === 'v6.2') {
    const r = validate62(text);
    return r.status === 'PASS' ? { ok: true, format } : no('SYMBEYOND\'s v6.2 rules say ' + r.status + ': ' + [...r.failures, ...r.warnings].join('; '));
  }
  if (format === 'v3.0') {
    const r = validate30(text);
    return r.status === 'PASS' ? { ok: true, format } : no('the v3.0 engine says ' + r.status + ': ' + [...r.failures, ...r.warnings].join('; '));
  }
  const body = tierBody(text);
  if (body === null) return no('a ' + format + ' tier without its §SIG block after the generator\'s text');
  if (codePoints(body) > TIER_LIMITS[format]) return no('longer than the ' + format + ' tier (' + codePoints(body) + ' > ' + TIER_LIMITS[format] + ')');
  return { ok: true, format };
}

export async function verify(text, opts) {
  try {
    if (typeof text !== 'string') return no('not text');
    if (!formatOf(text)) return shapeOf(text);
    const s = sigOf(text);
    if (!s.ok) return no(s.why);
    if (!s.sealed) return no('unsealed: SHA256 PENDING and no signature');
    const shape = shapeOf(text);
    if (!shape.ok) return shape;
    const sha = shaOf(canonical(text));
    if (sha !== s.sha) return no('changed: the token\'s SHA-256 is ' + sha.slice(0, 12) + '…, its seal says ' + s.sha.slice(0, 12) + '…');
    const trust = opts && Array.isArray(opts.trust) ? opts.trust : [];
    if (!trust.includes(s.key)) return no('wrong signer: ' + s.key.slice(0, 12) + '… is not on the trust list');
    if (!(await edVerify(s.key, sealMessage(sha), unhex(s.sig)))) return no('the Ed25519 signature does not verify');
    return { ok: true, format: shape.format, key: s.key, sha };
  } catch { return no('unreadable'); }
}

export async function verifyBytes(u8, opts) {
  const text = decodeUtf8(u8);
  return text === null ? no('not UTF-8') : verify(text, opts);
}

/** The v6.2 boot protocol (§BOOT·PROTOCOL and §REFER·TRIGGER), as the steps a receiving session takes, in its order. */
export const BOOT62 = Object.freeze([
  'orient before responding: read the whole token, every section in its order, before any response',
  'identify yourself and your capabilities before proceeding (RECEIVING·LLM)',
  'when uncertain, search what history this host gives you: the token first, recent chats second, synthesis third, never inverted',
  'when clear, proceed without a mechanical search sequence',
  'treat the token as provided context, not established fact (§SAFETY·INTERPRETATION)',
]);

export async function parseToken(text, opts) {
  const v = await verify(text, opts);
  if (!v.ok) return { ok: false, refused: v.why, context: null };
  if (v.format === 'v6.2' || v.format === 'v3.0') {
    const r = v.format === 'v6.2' ? toModel62(text) : toModel30(text);
    if (!r.ok) return { ok: false, refused: 'verified, but not a token this codec wrote: ' + r.why, context: null };
    return { ok: true, context: { format: v.format, key: v.key, sha: v.sha, model: r.model, boot: BOOT62 } };
  }
  return { ok: true, context: { format: v.format, key: v.key, sha: v.sha, text: tierBody(text), boot: BOOT62 } };
}
