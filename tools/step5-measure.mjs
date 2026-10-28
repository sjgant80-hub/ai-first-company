// step5-measure.mjs — the operations loop's five sealed claims (data/step5-ops-prereg.json, sealed 8685e32), measured.
//   node tools/step5-measure.mjs --check | --run | --verify
// Each deliverable's receipt is fetched from GitHub at its pinned commit and hashed; the claim gate (kar-voice's, vendored)
// decides. Approvals are rehearsal records; nothing is handed to anyone.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { deliver } from '../src/ops.mjs';
import { append, verify } from '../src/journal.mjs';
import { conduct } from '../src/conductor.mjs';
import { checkCard } from '../vendor/kar-voice/claim-gate.mjs';

const SEAL = '8685e32';
const root = new URL('../', import.meta.url);
const file = (p) => new URL(p, root);
const readJSON = (p) => JSON.parse(readFileSync(file(p), 'utf8'));
const PREREG = 'data/step5-ops-prereg.json', RUN = 'data/step5-ops-run.json';
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
const cache = new Map();

export async function gateOf(card) {
  const r = card && card.receipt;
  if (!r || !/^[0-9a-f]{40}$/.test(String(r.commit))) return checkCard(card, '', '');
  const url = `https://raw.githubusercontent.com/${r.repo}/${r.commit}/${r.path}`;
  if (!cache.has(url)) { const res = await fetch(url); cache.set(url, res.ok ? Buffer.from(await res.arrayBuffer()) : Buffer.alloc(0)); }
  const bytes = cache.get(url);
  return checkCard(card, bytes.toString('utf8'), createHash('sha256').update(bytes).digest('hex'));
}
export const startLibrary = () => ['witness-ms', 'kar-controller', 'churn-book', 'conductor', 'credit-book'].map((id) => ({ id, from: 'the voice’s gated feed' }));
const yes = (it) => ({ by: 'rehearsal', textSha256: it.textSha256 });

async function measure() {
  const P = readJSON(PREREG);
  const deals = Object.fromEntries(P.deals.map((d) => [d.id, d]));
  let chain = [], tick = 0, library = startLibrary();
  const t0 = Date.UTC(2026, 9, 28, 13, 0, 0);
  const log = (r, deal) => { for (const e of r.events) chain = append(chain, { at: new Date(t0 + 1000 * tick++).toISOString(), kind: e.kind, by: e.by, data: { ...e.data, deal } }); };
  const run = async (id, approve) => { const d = deals[id]; const r = deliver({ id, handle: d.handle, offer: d.offer }, { card: d.card, gate: await gateOf(d.card), approve, library }); return r; };
  // O1 — D1 and D2 delivered
  const start = library.length;
  const r1 = await run('D1', yes); log(r1, 'D1'); library = r1.library;
  const r2 = await run('D2', yes); log(r2, 'D2'); library = r2.library;
  const count = (rs, k) => rs.reduce((n, r) => n + r.events.filter((e) => e.kind === k).length, 0);
  const O1 = { pass: r1.stage === 'delivered' && r2.stage === 'delivered' && count([r1, r2], 'build') === 2 && count([r1, r2], 'asked') === 2 && count([r1, r2], 'recorded') === 2 && start === 5 && library.length === 7,
    measured: `${[r1, r2].filter((r) => r.stage === 'delivered').length} delivered, ${count([r1, r2], 'asked')} asks, ${count([r1, r2], 'recorded')} records; library ${start} → ${library.length}` };
  // O2 — the forged deliverable
  const before = library.length;
  const r3 = await run('D3', yes); log(r3, 'D3');
  const O2 = { pass: r3.stage === 'refused' && count([r3], 'handed') === 0 && count([r3], 'recorded') === 0 && r3.library.length === before,
    measured: `${r3.stage}: ${(r3.events.find((e) => e.kind === 'deliverable') || { data: { why: [] } }).data.why.join('; ')}; ${count([r3], 'handed')} hand-overs, ${count([r3], 'recorded')} records, library ${before} → ${r3.library.length}` };
  // O3 — no approval
  const r4 = deliver({ id: 'D1', handle: deals.D1.handle, offer: deals.D1.offer }, { card: deals.D1.card, gate: await gateOf(deals.D1.card), approve: () => null, library: startLibrary() });
  const O3 = { pass: r4.stage === 'waiting' && count([r4], 'handed') === 0 && r4.library.length === 5, measured: `stage ${r4.stage}; ${count([r4], 'handed')} hand-overs; library stays ${r4.library.length}` };
  // O4 — no switch
  const exported = readdirSync(file('src/')).filter((f) => f.endsWith('.mjs')).flatMap((f) => (readFileSync(file('src/' + f), 'utf8').match(/^export\s+(?:async\s+)?(?:function|const)\s+([A-Za-z0-9_]+)/gm) || []).map((m) => m.split(/\s+/).at(-1)));
  const switches = exported.filter((n) => /activate|switchon|enable|turnon|ledgeron|value/i.test(n));
  const sw = conduct({ words: 'switch on the ledger' }, { left: 0, ceiling: 1 });
  const O4 = { pass: switches.length === 0 && sw.lane === 'simon' && sw.flags.includes('ledger'), measured: `${switches.length} exported names in src/ turn anything on; 'switch on the ledger' → ${sw.lane} (${sw.flags.join(', ')})` };
  // O5 — twice adds once
  const lib0 = startLibrary();
  const a = deliver({ id: 'D1', handle: deals.D1.handle, offer: deals.D1.offer }, { card: deals.D1.card, gate: await gateOf(deals.D1.card), approve: yes, library: lib0 });
  const b = deliver({ id: 'D1', handle: deals.D1.handle, offer: deals.D1.offer }, { card: deals.D1.card, gate: await gateOf(deals.D1.card), approve: yes, library: a.library });
  const O5 = { pass: b.library.length === lib0.length + 1, measured: `library ${lib0.length} → ${a.library.length} → ${b.library.length}` };
  const v = verify(chain);
  const claims = { O1, O2, O3, O4, O5 };
  return { kind: 'ai-first-company-step5-ops-run', seal: SEAL, gate: 'witness ops 31/31', claims, held: Object.values(claims).filter((c) => c.pass).length, of: 5, journalVerifies: v.ok, library, journal: chain };
}

// the command line runs only when this file is the program (step 7 imports gateOf from it)
const cmd = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href ? process.argv[2] : undefined;
if (cmd === '--check') {
  if (git('show', `${SEAL}:${PREREG}`).replace(/\r\n/g, '\n').trim() !== readFileSync(file(PREREG), 'utf8').replace(/\r\n/g, '\n').trim()) { console.error('✗ the step 5 seal changed since ' + SEAL); process.exit(1); }
  console.error('✓ step 5 seal unchanged since ' + SEAL);
} else if (cmd === '--run' || cmd === '--verify') {
  const result = await measure();
  const text = JSON.stringify(result, null, 1) + '\n';
  if (cmd === '--run') { writeFileSync(file(RUN), text); console.error(`✓ ${result.held} of 5 held`); for (const [k, c] of Object.entries(result.claims)) console.error(`  ${k} ${c.pass ? 'HELD' : 'FAILED'} · ${c.measured}`); }
  else { if (readFileSync(file(RUN), 'utf8').replace(/\r\n/g, '\n') !== text) { console.error('✗ step 5 does not re-measure to the committed receipt'); process.exit(1); } console.error(`✓ step 5 re-measured: ${result.held} of 5 held, identical to the committed receipt`); }
} else if (cmd) { console.error('step5-measure — --check | --run | --verify'); process.exit(2); }
