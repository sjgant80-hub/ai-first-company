// cycle.mjs — one full turn of the company: post → signals → leads → close → delivery → library → the next post.
// Pure, total, deterministic, witness-gated: it composes the organs and keeps its own journal on a fixed clock.
//
//   cycle(world) → { journal, library, asks[] }
//     world: { us, now (ISO), library: [card], inbox: [{ line, then }], deliverables: { offerId: card },
//              gates: { cardId: claim-gate verdict }, approve(item) }
//     Every outward step is put to the conductor in its own words and asked when it says Simon; it goes only on an
//     approval of its exact text AND while oversight says it may (no pause, no denial).
import { conduct } from './conductor.mjs';
import { append, hashOf } from './journal.mjs';
import { readSignal } from './reach.mjs';
import { runLead } from './funnel.mjs';
import { deliver } from './ops.mjs';
import { mayGo } from './oversight.mjs';
import { draftPost } from '../vendor/kar-voice/voice-core.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function cycle(world) {
  const w = isObj(world) ? world : {};
  const t0 = typeof w.now === 'string' ? Date.parse(w.now) : NaN;
  if (!Number.isFinite(t0) || typeof w.us !== 'string' || !Array.isArray(w.library) || !Array.isArray(w.inbox)) return { journal: [], library: [], asks: [] };
  const approve = typeof w.approve === 'function' ? w.approve : () => null;
  const gates = isObj(w.gates) ? w.gates : {};
  const deliverables = isObj(w.deliverables) ? w.deliverables : {};
  let journal = [], tick = 0, library = w.library;
  const asks = [];
  const log = (kind, by, data) => { journal = append(journal, { at: new Date(t0 + 1000 * tick++).toISOString(), kind, by, data }); };
  const take = (events, tag) => { for (const e of events) { if (e.kind === 'asked') asks.push(e.data.item + ':' + tag); log(e.kind, e.by, { ...e.data, about: tag }); } };

  const post = (card) => {
    const d = draftPost(card);
    if (!d.ok) { log('refused', 'kar', { item: 'post', about: card && card.id, why: d.error }); return; }
    const sha = hashOf(d.text);
    const proven = isObj(gates[card.id]) && gates[card.id].ok === true;
    log('drafted', 'kar', { item: 'post', about: card.id, text: d.text, textSha256: sha, proven });
    if (!proven) { log('refused', 'kar', { item: 'post', about: card.id, why: 'the claim gate refused the card' }); return; }
    const r = conduct({ words: 'post the receipt card on X' }, { left: 0, ceiling: 1 });
    if (r.lane === 'simon') {
      asks.push('post:' + card.id);
      log('asked', 'kar', { item: 'post', about: card.id, textSha256: sha, flags: r.flags });
      const a = approve({ item: 'post', about: card.id, text: d.text, textSha256: sha });
      if (!isObj(a) || a.textSha256 !== sha || (a.by !== 'simon' && a.by !== 'rehearsal')) { log('waiting', 'kar', { item: 'post', about: card.id, textSha256: sha }); return; }
      log('approved', a.by, { item: 'post', about: card.id, textSha256: sha });
    }
    if (!mayGo(journal, sha)) { log('held', 'kar', { item: 'post', about: card.id, textSha256: sha }); return; }
    log('sent', 'kar', { item: 'post', about: card.id, textSha256: sha, dryRun: true });
  };

  // 1 — the post, from the library
  if (isObj(library[0])) post(library[0]);
  const start = new Set(library.filter(isObj).map((c) => c.id));
  // 2 — the inbox, read at the door; 3 — each lead walked, each close delivered
  for (const item of w.inbox) {
    const r = readSignal(isObj(item) ? item.line : null, { us: w.us, now: w.now });
    if (!r.ok) { log('refused-signal', 'kar', { why: r.why }); continue; }
    const id = r.signal.id;
    log('read', 'kar', { about: id, kind: r.signal.kind, flags: r.flags, eligible: r.eligible });
    const lead = { id, signal: { id, handle: r.signal.handle, text: r.signal.text, eligible: r.eligible }, then: item.then };   // read means item was an object; the funnel takes only a list of texts
    const res = runLead(lead, { us: w.us, approve: (x) => approve({ ...x, about: id }) });
    take(res.events, id);
    if (res.stage !== 'converted') continue;
    const card = deliverables[res.offer];
    const done = deliver({ id, handle: r.signal.handle, offer: res.offer }, { card, gate: isObj(card) ? gates[card.id] : null, approve: (x) => approve({ ...x, about: id }), library });
    take(done.events, id);
    library = done.library;
  }
  // 4 — the next post: every good this cycle added to the library
  for (const entry of library.filter((c) => isObj(c) && !start.has(c.id))) {
    post(Object.values(deliverables).find((c) => isObj(c) && c.id === entry.id));   // every library entry the cycle added came from a deliverable
  }
  return { journal, library, asks };
}

export default { cycle };
