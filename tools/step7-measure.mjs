// step7-measure.mjs — one full cycle's six sealed claims (data/step7-cycle-prereg.json, sealed 162b428), measured.
//   node tools/step7-measure.mjs --check | --run | --verify
// Writes data/cycle-run.json: the claims, the cycle's journal and its dashboard (the page renders and re-verifies it).
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { cycle } from '../src/cycle.mjs';
import { verify } from '../src/journal.mjs';
import { mayGo, dashboard } from '../src/oversight.mjs';
import { approvalFor } from '../vendor/kar-voice/claim-gate.mjs';
import { gateOf } from './step5-measure.mjs';

const SEAL = '162b428';
const root = new URL('../', import.meta.url);
const file = (p) => new URL(p, root);
const readJSON = (p) => JSON.parse(readFileSync(file(p), 'utf8'));
const PREREG = 'data/step7-cycle-prereg.json', RUN = 'data/cycle-run.json';
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();

async function world() {
  const P = readJSON(PREREG);
  // kar-voice's sealed genuine cards, fetched from GitHub at the sealing commit (no sibling checkout needed)
  const voice = await (await fetch('https://raw.githubusercontent.com/sjgant80-hub/kar-voice/06b86832b75f551ebb8c5e6b6113b24abde6dbff/data/claimgate-prereg.json')).json();
  const library = voice.genuine.map((c) => ({ ...c, anchor: c.receipt.sha256 }));
  const d1 = readJSON('data/step5-ops-prereg.json').deals.find((d) => d.id === 'D1').card;
  const pilot = { ...d1, anchor: d1.receipt.sha256 };
  const gates = {};
  for (const c of library.concat([pilot])) gates[c.id] = await gateOf(c);
  const approvals = [];
  const approve = (it) => { if (it.item === 'post' && it.about === 'pilot-180k') return null; const a = { itemId: it.item + ':' + it.about, textSha256: it.textSha256, by: 'rehearsal', via: 'rehearsal', quote: '' }; approvals.push(a); return a; };
  return { P, w: { us: P.world.us, now: P.world.now, library, inbox: P.world.inbox, deliverables: { 'liveware-pilot': pilot }, gates, approve }, approvals, gates, library };
}

async function measure() {
  const { P, w, approvals, gates } = await world();
  const { journal, library, asks } = cycle(w);
  const L1 = { pass: JSON.stringify(asks) === JSON.stringify(P.world.expectedAsks), measured: `asked: ${asks.join(', ')}` };
  const outside = journal.filter((e) => e.kind === 'asked' && ['c2', 'c3', 'c4'].includes(e.data.about)).length;
  const others = journal.filter((e) => !['asked', 'approved', 'waiting', 'sent', 'handed'].includes(e.kind)).length;
  const L2 = { pass: asks.length === P.world.expectedAsks.length && outside === 0, measured: `${others} steps ran without an ask; asks for c2, c3, c4: ${outside}; c3 (asked for an API key) read as ${(journal.find((e) => e.kind === 'read' && e.data.about === 'c3') || { data: { flags: [] } }).data.flags.join(', ') || 'no flags'}; c4 refused at the door: ${(journal.find((e) => e.kind === 'refused-signal') || { data: { why: 'no' } }).data.why}` };
  const outward = journal.map((e, i) => [e, i]).filter(([e]) => e.kind === 'sent' || e.kind === 'handed');
  const ok3 = outward.filter(([e, i]) => journal.slice(0, i).some((x) => x.kind === 'approved' && x.data.textSha256 === e.data.textSha256) && mayGo(journal.slice(0, i), e.data.textSha256));
  const L3 = { pass: outward.length > 0 && ok3.length === outward.length, measured: `${ok3.length} of ${outward.length} outward steps followed an approval of their exact text with mayGo true` };
  const live = approvals.filter((a) => approvalFor(a.itemId, a.textSha256, [a], true).ok).length;
  const L4 = { pass: approvals.length === 5 && live === 0, measured: `${live} of ${approvals.length} rehearsal approvals would go live` };
  const inLib = library.some((e) => e.id === 'pilot-180k');
  const nextAsked = journal.some((e) => e.kind === 'asked' && e.data.item === 'post' && e.data.about === 'pilot-180k');
  const nextWaiting = journal.some((e) => e.kind === 'waiting' && e.data.item === 'post' && e.data.about === 'pilot-180k');
  const L5 = { pass: inLib && gates['pilot-180k'].ok && nextAsked && nextWaiting, measured: `pilot-180k in the library: ${inLib}; claim gate at its pin: ${gates['pilot-180k'].ok ? 'passes' : 'refused'}; the next post asked: ${nextAsked}; waiting for Simon: ${nextWaiting}` };
  const v = verify(journal);
  const d = dashboard(journal);
  const plain = { signals: journal.filter((e) => e.kind === 'signal').length, converted: journal.filter((e) => e.kind === 'converted').length, sent: journal.filter((e) => e.kind === 'sent').length, asked: journal.filter((e) => e.kind === 'asked').length, recorded: journal.filter((e) => e.kind === 'recorded').length };
  const same = d.signals.all === plain.signals && d.leads.converted === plain.converted && d.content.sent === plain.sent && d.content.asked === plain.asked && d.deliveries.recorded === plain.recorded;
  const L6 = { pass: v.ok && same, measured: `journal ${v.ok ? 'verifies' : 'broken at ' + v.at} (${journal.length} entries); dashboard ${same ? 'equals' : 'DIFFERS FROM'} the plain count` };
  const claims = { L1, L2, L3, L4, L5, L6 };
  return { kind: 'ai-first-company-cycle-run', seal: SEAL, gate: 'witness cycle 26/26', claims, held: Object.values(claims).filter((c) => c.pass).length, of: 6, asks, dashboard: d, library: library.map((e) => ({ id: e.id, name: e.name, from: e.from || 'the voice’s gated feed', receipt: e.receipt ? { repo: e.receipt.repo, commit: e.receipt.commit, path: e.receipt.path } : null })), journal };
}

const cmd = process.argv[2];
if (cmd === '--check') {
  if (git('show', `${SEAL}:${PREREG}`).replace(/\r\n/g, '\n').trim() !== readFileSync(file(PREREG), 'utf8').replace(/\r\n/g, '\n').trim()) { console.error('✗ the step 7 seal changed since ' + SEAL); process.exit(1); }
  console.error('✓ step 7 seal unchanged since ' + SEAL);
} else if (cmd === '--run' || cmd === '--verify') {
  const result = await measure();
  const text = JSON.stringify(result, null, 1) + '\n';
  if (cmd === '--run') { writeFileSync(file(RUN), text); console.error(`✓ ${result.held} of 6 held`); for (const [k, c] of Object.entries(result.claims)) console.error(`  ${k} ${c.pass ? 'HELD' : 'FAILED'} · ${c.measured}`); }
  else { if (readFileSync(file(RUN), 'utf8').replace(/\r\n/g, '\n') !== text) { console.error('✗ the cycle does not re-measure to the committed receipt'); process.exit(1); } console.error(`✓ the cycle re-measured: ${result.held} of 6 held, identical to the committed receipt`); }
} else if (cmd) { console.error('step7-measure — --check | --run | --verify'); process.exit(2); }
