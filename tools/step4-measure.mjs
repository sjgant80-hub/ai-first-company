// step4-measure.mjs — the funnel's five sealed claims (data/step4-funnel-prereg.json, sealed d79ce44), measured.
//
//   node tools/step4-measure.mjs --check | --run | --verify
// Each sealed lead is walked with a REHEARSAL approver (an approval bound to each asked item's text hash — Simon's real
// approvals do not exist yet), its events stamped on a fixed clock and appended to one journal; nothing is sent anywhere.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { runLead, wordsOk } from '../src/funnel.mjs';
import { append, verify } from '../src/journal.mjs';

const SEAL = 'd79ce44';
const root = new URL('../', import.meta.url);
const file = (p) => new URL(p, root);
const readJSON = (p) => JSON.parse(readFileSync(file(p), 'utf8'));
const PREREG = 'data/step4-funnel-prereg.json', RUN = 'data/step4-funnel-run.json';
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
const US = 'example_co';

export function walk(leads, t0 = Date.UTC(2026, 9, 28, 12, 0, 0)) {
  let chain = [], tick = 0;
  const results = [];
  for (const L of leads) {
    const r = runLead(L, { us: US, approve: (it) => ({ by: 'rehearsal', textSha256: it.textSha256 }) });
    for (const e of r.events) chain = append(chain, { at: new Date(t0 + 1000 * tick++).toISOString(), kind: e.kind, by: e.by, data: { lead: L.id, ...e.data } });
    results.push({ id: L.id, stage: r.stage, offer: r.offer, asked: r.events.filter((e) => e.kind === 'asked').length, drafts: r.events.filter((e) => e.kind === 'drafted').map((e) => e.data) });
  }
  return { chain, results };
}

function measure() {
  const P = readJSON(PREREG);
  const { chain, results } = walk(P.leads);
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));
  const g1 = P.leads.map((L) => { const r = byId[L.id]; return { id: L.id, stage: r.stage, offer: r.offer, asked: r.asked, ok: r.stage === L.expect.stage && r.offer === L.expect.offer && r.asked === L.expect.asked }; });
  const G1 = { pass: g1.every((x) => x.ok), measured: `${g1.filter((x) => x.ok).length} of ${g1.length} leads as stated`, leads: g1 };
  const G2 = { pass: byId.L4.drafts.length === 0, measured: `${byId.L4.drafts.length} drafts for L4` };
  const offerDrafts = ['L5', 'L6'].reduce((n, id) => n + byId[id].drafts.filter((d) => d.item === 'offer').length, 0);
  const G3 = { pass: offerDrafts === 0, measured: `${offerDrafts} offer drafts for L5 and L6` };
  const drafts = results.flatMap((r) => r.drafts);
  const bad = drafts.filter((d) => !wordsOk(d.text).ok);
  const G4 = { pass: drafts.length > 0 && bad.length === 0, measured: `${drafts.length - bad.length} of ${drafts.length} drafts pass the word rules and link only to estate pages` };
  // G5: every send follows an approval of the same text hash; the chain verifies; one changed byte in any record is caught there
  const approvedBefore = (i, sha) => chain.slice(0, i).some((e) => e.kind === 'approved' && e.data.textSha256 === sha);
  const sends = chain.map((e, i) => [e, i]).filter(([e]) => e.kind === 'sent');
  const unapproved = sends.filter(([e, i]) => !approvedBefore(i, e.data.textSha256)).length;
  const v = verify(chain);
  let caught = 0;
  for (let i = 0; i < chain.length; i++) {
    const t = JSON.parse(JSON.stringify(chain));
    t[i].data = { ...t[i].data, lead: t[i].data.lead + 'x' };
    const r = verify(t);
    if (!r.ok && r.at === i) caught++;
  }
  const G5 = { pass: unapproved === 0 && v.ok && caught === chain.length, measured: `${sends.length} sends, ${unapproved} without an approval of their text; journal ${v.ok ? 'verifies' : 'BROKEN at ' + v.at} (${chain.length} records); a one-byte change caught at its own record ${caught} of ${chain.length} times` };
  const claims = { G1, G2, G3, G4, G5 };
  return { kind: 'ai-first-company-step4-funnel-run', seal: SEAL, gate: 'witness funnel 35/35 · journal 18/18', claims, held: Object.values(claims).filter((c) => c.pass).length, of: 5, journal: chain };
}

const cmd = process.argv[2];
if (cmd === '--check') {
  if (git('show', `${SEAL}:${PREREG}`).replace(/\r\n/g, '\n').trim() !== readFileSync(file(PREREG), 'utf8').replace(/\r\n/g, '\n').trim()) { console.error('✗ the step 4 seal changed since ' + SEAL); process.exit(1); }
  console.error('✓ step 4 seal unchanged since ' + SEAL);
} else if (cmd === '--run' || cmd === '--verify') {
  const result = measure();
  const text = JSON.stringify(result, null, 1) + '\n';
  if (cmd === '--run') { writeFileSync(file(RUN), text); console.error(`✓ ${result.held} of 5 held`); for (const [k, c] of Object.entries(result.claims)) console.error(`  ${k} ${c.pass ? 'HELD' : 'FAILED'} · ${c.measured}`); }
  else { if (readFileSync(file(RUN), 'utf8').replace(/\r\n/g, '\n') !== text) { console.error('✗ step 4 does not re-measure to the committed receipt'); process.exit(1); } console.error(`✓ step 4 re-measured: ${result.held} of 5 held, identical to the committed receipt`); }
} else if (cmd) { console.error('step4-measure — --check | --run | --verify'); process.exit(2); }
