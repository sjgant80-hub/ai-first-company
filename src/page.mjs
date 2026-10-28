// page.mjs — what the live page shows, derived from the cycle's receipt by the same gated kernels. Pure, total.
//
//   viewOf(run) → { ok, verified, matches, tiles, funnel, waiting, trace } | { ok: false, why }
//     verified: the journal re-verifies here (in the reader's browser, on the page)
//     matches:  the dashboard re-derived here equals the one the receipt carries
//   lineOf(entry) → one plain sentence for one journal entry
import { verify } from './journal.mjs';
import { dashboard, queue } from './oversight.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const WHO = { kar: 'Kar', grok: 'Grok Bot', simon: 'Simon', rehearsal: 'The rehearsal approver' };
const ITEM = { post: 'the post', reply: 'the reply', offer: 'the offer', close: 'the close', 'hand-over': 'the hand-over' };

export function lineOf(e) {
  if (!isObj(e) || !isObj(e.data)) return '';
  const d = e.data, who = WHO[e.by] || 'Someone', it = ITEM[d.item] || 'the item', about = typeof d.about === 'string' ? ` (${d.about})` : '';
  switch (e.kind) {
    case 'drafted': return `Kar drafted ${it}${about}${d.item === 'post' ? (d.proven ? '; the claim gate proved every number against its receipt' : '; the claim gate refused it') : ''}.`;
    case 'asked': return `Kar asked Simon to approve ${it}${about}: ${(Array.isArray(d.flags) ? d.flags : []).join(', ') || 'outward'}.`;
    case 'approved': return `${who} approved ${it}${about}, bound to its exact words.`;
    case 'waiting': return `${it[0].toUpperCase() + it.slice(1)}${about} is waiting for Simon.`;
    case 'sent': return d.item === 'close' ? `The close${about} was committed (a dry run).` : `${it[0].toUpperCase() + it.slice(1)}${about} went out (a dry run: nothing reaches X).`;
    case 'held': return `${it[0].toUpperCase() + it.slice(1)}${about} was held: oversight says not now.`;
    case 'refused': return `Kar refused ${it}${about}: ${d.why}.`;
    case 'refused-signal': return `A line from Grok Bot was refused at the door: ${d.why}.`;
    case 'read': return `Kar checked a line from Grok Bot${about} at the door${Array.isArray(d.flags) && d.flags.length ? ', flagged ' + d.flags.join(', ') : ''}: ${d.eligible ? 'eligible for an answer' : 'a market signal only'}.`;
    case 'signal': return `The post${about} entered the funnel.`;
    case 'market': return `Recorded as a market signal${about}: no one is contacted.`;
    case 'no-offer': return `No offer fits${about}: nothing is pitched.`;
    case 'qualified': return `Qualified${about}: ${d.offer}.`;
    case 'engaged': return `The person answered${about}: they want to start.`;
    case 'converted': return `Converted${about}: ${d.offer}.`;
    case 'build': return `Kar built the deliverable for ${d.offer}${about}.`;
    case 'deliverable': return `The deliverable${about} ${d.proven ? 'passed' : 'failed'} the claim gate at its pinned receipt.`;
    case 'handed': return `Handed over${about} (a dry run).`;
    case 'recorded': return `Recorded${about} in the journal: ${d.card}, by its receipt pin.`;
    case 'library': return `The library ${d.added ? 'grew' : 'already had it'}${about}: ${d.size} goods.`;
    default: return `${who}: ${e.kind}${about}.`;
  }
}

export function viewOf(run) {
  if (!isObj(run) || !Array.isArray(run.journal)) return { ok: false, why: 'no cycle receipt' };
  const j = run.journal;
  const v = verify(j);
  const d = dashboard(j);
  const matches = JSON.stringify(d) === JSON.stringify(run.dashboard);
  const tiles = [
    { n: d.signals.all, l: 'posts Grok Bot passed on' },
    { n: d.leads.qualified, l: 'leads qualified' },
    { n: d.leads.converted, l: 'converted' },
    { n: d.content.sent, l: 'outward steps gone (dry run)' },
    { n: d.content.asked, l: 'asks of Simon' },
    { n: d.queue.waiting, l: 'waiting for Simon now' },
    { n: d.deliveries.recorded, l: 'deliveries recorded' },
    { n: d.library, l: 'goods in the library' },
  ];
  const funnel = [
    { l: 'Posts read', n: d.signals.all },
    { l: 'Eligible to answer', n: d.signals.eligible },
    { l: 'Qualified', n: d.leads.qualified },
    { l: 'Converted', n: d.leads.converted },
  ];
  const waiting = queue(j).filter((x) => x.state === 'waiting').map((x) => ({ item: x.item, about: x.about }));
  return { ok: true, verified: v.ok, entries: j.length, matches, tiles, funnel, waiting, trace: j.map(lineOf) };
}

export default { viewOf, lineOf };
