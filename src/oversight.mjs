// oversight.mjs — what Simon sees and steers, read straight off the journal. Pure, total, deterministic, witness-gated.
//
//   queue(journal)              → [{ n, item, textSha256, flags, about, state }] — every ask, and where it stands
//   mayGo(journal, textSha256)  → may that exact item go out now? approved, not denied, not withdrawn, not paused
//   paused(journal)             → is everything outward paused right now?
//   notesFor(journal)           → Simon's notes on what he denied, for the next draft
//   pickWithFocus(text, focus)  → the person's own offer; Simon's focus decides only a tie it is part of
//   dashboard(journal)          → every number on the page, each a count of the journal's own entries
import { OFFERS } from './funnel.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const entries = (j) => (Array.isArray(j) ? j.filter((e) => isObj(e) && typeof e.kind === 'string') : []);
const data = (e) => (isObj(e.data) ? e.data : {});
const STEERS = ['simon', 'rehearsal'];
const steers = (j) => entries(j).filter((e) => e.kind === 'steer' && STEERS.includes(e.by));

export function paused(journal) {
  let p = false;
  for (const e of steers(journal)) if (typeof data(e).pause === 'boolean') p = data(e).pause;
  return p;
}

const stateOf = (j, sha) => {
  if (steers(j).some((e) => data(e).deny === sha)) return 'denied';
  if (steers(j).some((e) => data(e).withdraw === sha)) return 'withdrawn';
  if (entries(j).some((e) => e.kind === 'approved' && data(e).textSha256 === sha)) return 'approved';
  return 'waiting';
};

export function queue(journal) {
  return entries(journal).filter((e) => e.kind === 'asked').map((e) => {
    const d = data(e);
    return { n: e.n, item: d.item, textSha256: d.textSha256, flags: Array.isArray(d.flags) ? d.flags : [], about: d.about || d.lead || d.deal || null, state: stateOf(journal, d.textSha256) };
  });
}

export const mayGo = (journal, sha) => typeof sha === 'string' && stateOf(journal, sha) === 'approved' && !paused(journal);

export const notesFor = (journal) => steers(journal).filter((e) => typeof data(e).deny === 'string' && typeof data(e).note === 'string').map((e) => ({ textSha256: data(e).deny, note: data(e).note }));

export function pickWithFocus(text, focus) {
  const words = String(text).toLowerCase().replace(/https?:\/\/\S+/g, ' ').split(/[^a-z0-9]+/).filter(Boolean);
  const hits = OFFERS.map((o) => ({ o, n: words.filter((w) => o.words.includes(w)).length }));
  const top = Math.max(...hits.map((h) => h.n));
  const best = hits.filter((h) => h.n === top);
  if (top === 0) return null;
  if (best.length === 1) return best[0].o;
  const f = best.find((h) => h.o.id === focus);
  return f ? f.o : null;
}

export function dashboard(journal) {
  const E = entries(journal);
  const count = (kind, pred) => E.filter((e) => e.kind === kind && (!pred || pred(data(e)))).length;
  const q = queue(journal);
  const libs = E.filter((e) => e.kind === 'library' && Number.isSafeInteger(data(e).size));
  return {
    signals: { all: count('signal'), eligible: count('signal', (d) => d.eligible === true), market: count('market') },
    leads: { qualified: count('qualified'), converted: count('converted') },
    content: { drafted: count('drafted'), asked: count('asked'), approved: count('approved'), sent: count('sent') },
    deliveries: { handed: count('handed'), recorded: count('recorded') },
    library: libs.length ? data(libs[libs.length - 1]).size : null,
    queue: { waiting: q.filter((x) => x.state === 'waiting').length, approved: q.filter((x) => x.state === 'approved').length, denied: q.filter((x) => x.state === 'denied').length },
    steering: steers(journal).length,
    paused: paused(journal),
  };
}

export default { queue, mayGo, paused, notesFor, pickWithFocus, dashboard };
