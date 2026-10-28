// ops.mjs — from a closed deal to a delivered, recorded good that grows the library. Pure, total, deterministic,
// witness-gated. The claim gate's verdict on the deliverable is computed by the caller (the receipt is fetched from GitHub
// at its pin and hashed there) and passed in; this file decides what happens with it.
//
//   deliver(deal, { card, gate, approve, library }) → { stage, events[], library }
//     stage: 'refused' (the deliverable is not proven) · 'waiting' (Simon has not approved the hand-over) · 'delivered'
//     library: the library after the delivery (the same array when nothing was added)
//   addToLibrary(library, entry) → a new library with the entry, or the same one when the id is already there
import { conduct } from './conductor.mjs';
import { hashOf } from './journal.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const pinOf = (c) => (isObj(c) && isObj(c.receipt) ? { repo: c.receipt.repo, commit: c.receipt.commit, path: c.receipt.path, sha256: c.receipt.sha256 } : null);

export function addToLibrary(library, entry) {
  const lib = Array.isArray(library) ? library : [];
  if (!isObj(entry) || typeof entry.id !== 'string' || !entry.id || lib.some((e) => isObj(e) && e.id === entry.id)) return lib;
  return lib.concat([entry]);
}

export function deliver(deal, opts) {
  const o = isObj(opts) ? opts : {};
  const library = Array.isArray(o.library) ? o.library : [];
  const approve = typeof o.approve === 'function' ? o.approve : () => null;
  const events = [];
  const say = (kind, by, data) => { events.push({ kind, by, data }); };
  if (!isObj(deal) || typeof deal.id !== 'string' || typeof deal.handle !== 'string' || typeof deal.offer !== 'string' || !isObj(o.card)) return { stage: 'unreadable', events, library };
  const build = conduct({ words: `build the deliverable for ${deal.offer}` }, { left: 0, ceiling: 1 });
  say('build', 'kar', { deal: deal.id, offer: deal.offer, lane: build.lane });
  if (build.lane === 'simon') { say('waiting', 'kar', { deal: deal.id, why: build.why }); return { stage: 'waiting', events, library }; }
  const gate = isObj(o.gate) && o.gate.ok === true;
  say('deliverable', 'kar', { deal: deal.id, card: o.card.id, receipt: pinOf(o.card), proven: gate, why: isObj(o.gate) && Array.isArray(o.gate.why) ? o.gate.why : ['no verdict'] });
  if (!gate) { say('refused', 'kar', { deal: deal.id, card: o.card.id }); return { stage: 'refused', events, library }; }
  const text = `Hand-over to @${deal.handle}: ${o.card.name}: ${o.card.claim}. ${o.card.url}`;
  const sha = hashOf(text);
  const hand = conduct({ words: `hand the deliverable to @${deal.handle}` }, { left: 0, ceiling: 1 });
  if (hand.lane === 'simon') {
    say('asked', 'kar', { deal: deal.id, item: 'hand-over', textSha256: sha, flags: hand.flags });
    const a = approve({ item: 'hand-over', text, textSha256: sha, deal: deal.id });
    if (!isObj(a) || a.textSha256 !== sha || (a.by !== 'simon' && a.by !== 'rehearsal')) { say('waiting', 'kar', { deal: deal.id, item: 'hand-over' }); return { stage: 'waiting', events, library }; }
    say('approved', a.by, { deal: deal.id, item: 'hand-over', textSha256: sha });
  }
  say('handed', 'kar', { deal: deal.id, textSha256: sha, dryRun: true });
  say('recorded', 'kar', { deal: deal.id, offer: deal.offer, card: o.card.id, receipt: pinOf(o.card) });
  const next = addToLibrary(library, { id: o.card.id, name: o.card.name, from: deal.id, receipt: pinOf(o.card) });
  say('library', 'kar', { deal: deal.id, added: next !== library, size: next.length });
  return { stage: 'delivered', events, library: next };
}

export default { deliver, addToLibrary };
