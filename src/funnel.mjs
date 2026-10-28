// funnel.mjs — from a person who asked to a customer. Pure, total, deterministic, witness-gated.
//
//   pickOffer(text)             → the one offer the person's own words call for, or null (none, or a tie)
//   replyText(handle, offer) · offerText(handle, offer)  → the drafts (plain words, the offer's own page, nothing else)
//   wordsOk(text)               → { ok, why[] } — the claim gate's word rules, and links only to the estate's own pages
//   runLead(lead, { approve, us })
//                               → { stage, offer, events[] } — the lead walked as far as it goes. Every outward step is
//                                 put to the conductor in its own words; when the conductor says Simon, the step is ASKED
//                                 and goes out only if approve(item) returns an approval for that exact text's hash.
//                                 events are journal-ready ({ kind, by, data }); the caller stamps and appends them.
import { conduct } from './conductor.mjs';
import { hashOf } from './journal.mjs';
import { HYPE, PRICE, ECONOMY, JARGON } from '../vendor/kar-voice/claim-gate.mjs';

export const OFFERS = Object.freeze([
  Object.freeze({ id: 'liveware-pilot', name: 'the liveware pilot', url: 'https://sjgant80-hub.github.io/break-it/', words: Object.freeze(['untrusted', 'files', 'file', 'parse', 'parser', 'ingest', 'attack', 'breach', 'gateway', 'input', 'inputs']) }),
  Object.freeze({ id: 'grow-a-brain', name: 'grow a brain from your own data', url: 'https://sjgant80-hub.github.io/konomi-slm/brain.html', words: Object.freeze(['own', 'model', 'spreadsheets', 'spreadsheet', 'csv', 'predict', 'trained', 'train', 'data']) }),
  Object.freeze({ id: 'digi', name: 'DIGI cards', url: 'https://sjgant80-hub.github.io/digi-card/', words: Object.freeze(['card', 'cards', 'collect', 'collectible', 'digi']) }),
]);
const LINK = /https?:\/\/\S+/g;
const ESTATE = /^https:\/\/(sjgant80-hub\.github\.io\/|github\.com\/sjgant80-hub\/)/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function pickOffer(text) {
  const words = String(text).toLowerCase().replace(LINK, ' ').split(/[^a-z0-9]+/).filter(Boolean);
  let best = null, top = 0, tie = false;
  for (const o of OFFERS) {
    const hits = words.filter((w) => o.words.includes(w)).length;
    if (hits > top) { best = o; top = hits; tie = false; } else if (hits === top) tie = true;
  }
  return tie ? null : best;   // no hits at all is a tie at zero
}

export const replyText = (handle, offer) => `@${handle} Thanks for asking. That is ${offer.name}: ${offer.url}\nEvery claim on that page links to a receipt you can re-run yourself.`;
export const offerText = (handle, offer) => `@${handle} Here is how ${offer.name} starts: ${offer.url}\nSay go ahead here when you are ready, and we will set it up with you.`;

export function wordsOk(text) {
  const t = String(text);
  const why = [];
  if (HYPE.test(t)) why.push('hype');
  if (PRICE.test(t)) why.push('a price');
  if (ECONOMY.test(t)) why.push('an economy term');
  if (JARGON.test(t)) why.push('estate jargon');
  for (const u of t.match(LINK) || []) if (!ESTATE.test(u)) why.push('a link off the estate: ' + u);
  return { ok: why.length === 0, why };
}

const summons = (text, us) => new RegExp('(^|[^A-Za-z0-9_])@' + us + '(?![A-Za-z0-9_])', 'i').test(String(text));

export function runLead(lead, opts) {
  const o = isObj(opts) ? opts : {};
  const us = typeof o.us === 'string' && /^[A-Za-z0-9_]{1,15}$/.test(o.us) ? o.us : null;
  const approve = typeof o.approve === 'function' ? o.approve : () => null;
  const events = [];
  const say = (kind, by, data) => { events.push({ kind, by, data }); };
  const end = (stage, offer) => ({ stage, offer: offer ? offer.id : null, events });
  if (!isObj(lead) || !isObj(lead.signal) || typeof lead.signal.text !== 'string' || typeof lead.signal.handle !== 'string' || us === null) return { stage: 'unreadable', offer: null, events };
  const s = lead.signal;
  say('signal', 'grok', { id: s.id, handle: s.handle, text: s.text, eligible: s.eligible === true });
  if (s.eligible !== true) { say('market', 'kar', { id: s.id }); return end('market', null); }
  const offer = pickOffer(s.text);
  if (!offer) { say('no-offer', 'kar', { id: s.id }); return end('no-offer', null); }
  say('qualified', 'kar', { id: s.id, offer: offer.id });

  // one outward step: drafted, put to the conductor in its own words, asked if the conductor says Simon, sent only on an
  // approval of these exact words
  const step = (item, text, words) => {
    const w = wordsOk(text);
    const sha = hashOf(text);
    say('drafted', 'kar', { item, text, textSha256: sha, wordsOk: w.ok });
    if (!w.ok) return false;
    const r = conduct({ words }, { left: 0, ceiling: 1 });
    if (r.lane === 'simon') {
      say('asked', 'kar', { item, textSha256: sha, flags: r.flags });
      const a = approve({ item, text, textSha256: sha, handle: s.handle });
      if (!isObj(a) || a.textSha256 !== sha || (a.by !== 'simon' && a.by !== 'rehearsal')) { say('waiting', 'kar', { item, textSha256: sha }); return false; }
      say('approved', a.by, { item, textSha256: sha });
    }
    say('sent', 'kar', { item, textSha256: sha, dryRun: true });
    return true;
  };
  if (!step('reply', replyText(s.handle, offer), `reply to @${s.handle} with the drafted answer`)) return end('qualified', offer);
  const then = Array.isArray(lead.then) ? lead.then.filter((t) => typeof t === 'string') : [];
  if (then.length < 1 || !summons(then[0], us)) return end('replied', offer);
  say('signal', 'grok', { handle: s.handle, text: then[0], eligible: true });
  say('engaged', 'kar', { handle: s.handle });
  if (!step('offer', offerText(s.handle, offer), `send the offer to @${s.handle}`)) return end('engaged', offer);
  if (then.length < 2 || !summons(then[1], us)) return end('offered', offer);
  say('signal', 'grok', { handle: s.handle, text: then[1], eligible: true });
  if (!step('close', `Close: ${offer.id} with @${s.handle}, as offered.`, `close the deal with @${s.handle}`)) return end('accepted', offer);
  say('converted', 'kar', { handle: s.handle, offer: offer.id });
  return end('converted', offer);
}

export default { OFFERS, pickOffer, replyText, offerText, wordsOk, runLead };
