// journal.mjs — the company's record: every event one entry in a hash chain. Pure, total, deterministic, witness-gated.
// The SHA-256 is fall-kit's pure synchronous one (vendored byte-identical), so a browser tab re-verifies the same bytes.
//
//   canonical(value)          → JSON with object keys sorted, so the same event always hashes the same
//   hashOf(text)              → lowercase hex SHA-256 of the UTF-8 text
//   append(chain, event)      → a NEW chain with { n, at, kind, by, data, prev, hash } added (the input is not changed),
//                               or null when the event is not one the journal takes
//   verify(chain)             → { ok: true, n } | { ok: false, at, why } — the first entry that does not hold
import { sha256, hex } from '../vendor/fall-kit/light/sha256.mjs';

export const BY = Object.freeze(['kar', 'grok', 'simon', 'rehearsal']);
export const GENESIS = '0'.repeat(64);
const enc = new TextEncoder();
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (isObj(v)) return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}
export const hashOf = (text) => hex(sha256(enc.encode(String(text))));
const body = (e) => canonical({ n: e.n, at: e.at, kind: e.kind, by: e.by, data: e.data, prev: e.prev });

export function append(chain, event) {
  if (!Array.isArray(chain) || !isObj(event)) return null;
  const { at, kind, by, data } = event;
  if (typeof at !== 'string' || !at || typeof kind !== 'string' || !kind || !BY.includes(by)) return null;
  const last = chain[chain.length - 1];
  const e = { n: chain.length, at, kind, by, data: data === undefined ? null : data, prev: last ? last.hash : GENESIS };
  return chain.concat([{ ...e, hash: hashOf(body(e)) }]);
}

export function verify(chain) {
  if (!Array.isArray(chain)) return { ok: false, at: 0, why: 'not a journal' };
  let prev = GENESIS;
  for (let i = 0; i < chain.length; i++) {
    const e = chain[i];
    if (!isObj(e)) return { ok: false, at: i, why: 'not an entry' };
    if (e.n !== i) return { ok: false, at: i, why: 'out of order' };
    if (e.prev !== prev) return { ok: false, at: i, why: 'does not follow the entry before it' };
    if (e.hash !== hashOf(body(e))) return { ok: false, at: i, why: 'changed after it was written' };
    prev = e.hash;
  }
  return { ok: true, n: chain.length };
}

export default { BY, GENESIS, canonical, hashOf, append, verify };
