// step6-measure.mjs — oversight's four sealed claims (data/step6-oversight-prereg.json, sealed 18a0f83), measured.
//   node tools/step6-measure.mjs --check | --run | --verify
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { queue, mayGo, paused, notesFor, pickWithFocus, dashboard } from '../src/oversight.mjs';
import { append, verify } from '../src/journal.mjs';

const SEAL = '18a0f83';
const root = new URL('../', import.meta.url);
const file = (p) => new URL(p, root);
const readJSON = (p) => JSON.parse(readFileSync(file(p), 'utf8'));
const PREREG = 'data/step6-oversight-prereg.json', RUN = 'data/step6-oversight-run.json';
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();

/** The step 4 and step 5 journals as one chain, in their own order. */
export function combined() {
  let chain = [];
  for (const e of readJSON('data/step4-funnel-run.json').journal.concat(readJSON('data/step5-ops-run.json').journal)) chain = append(chain, { at: e.at, kind: e.kind, by: e.by, data: e.data });
  return chain;
}
const steer = (j, data, by = 'rehearsal') => append(j, { at: '2026-10-28T14:00:00.000Z', kind: 'steer', by, data });

function measure() {
  const P4 = readJSON('data/step4-funnel-prereg.json');
  const j = combined();
  // S1 — the dashboard against a plain count written here, independently
  const d = dashboard(j);
  const c = (k, f) => j.filter((e) => e.kind === k && (!f || f(e.data))).length;
  const asked = j.filter((e) => e.kind === 'asked').map((e) => e.data.textSha256);
  const approved = new Set(j.filter((e) => e.kind === 'approved').map((e) => e.data.textSha256));
  const libs = j.filter((e) => e.kind === 'library');
  const plain = {
    signals: { all: c('signal'), eligible: c('signal', (x) => x.eligible === true), market: c('market') },
    leads: { qualified: c('qualified'), converted: c('converted') },
    content: { drafted: c('drafted'), asked: c('asked'), approved: c('approved'), sent: c('sent') },
    deliveries: { handed: c('handed'), recorded: c('recorded') },
    library: libs.length ? libs[libs.length - 1].data.size : null,
    queue: { waiting: asked.filter((h) => !approved.has(h)).length, approved: asked.filter((h) => approved.has(h)).length, denied: 0 },
    steering: 0, paused: false,
  };
  const v = verify(j);
  const S1 = { pass: JSON.stringify(d) === JSON.stringify(plain) && v.ok, measured: `dashboard ${JSON.stringify(d) === JSON.stringify(plain) ? 'equals' : 'DIFFERS FROM'} the plain count; the combined journal (${j.length} entries) ${v.ok ? 'verifies' : 'is broken at ' + v.at}`, dashboard: d };
  // S2 — the pause
  const items = queue(j).filter((x) => x.state === 'approved').map((x) => x.textSha256);
  const one = items[0];
  const before = mayGo(j, one);
  const p = steer(j, { pause: true }, 'simon');
  const during = items.filter((h) => mayGo(p, h)).length;
  const u = steer(p, { pause: false }, 'simon');
  const after = mayGo(u, one);
  const S2 = { pass: before === true && during === 0 && after === true && paused(p) && !paused(u), measured: `before ${before}; while paused ${during} of ${items.length} approved items may go; after ${after}` };
  // S3 — a denial sticks and teaches
  const target = queue(j).find((x) => x.item === 'offer').textSha256;
  const dn = steer(j, { deny: target, note: 'too soon to offer; answer the question first' }, 'simon');
  const re = append(dn, { at: '2026-10-28T14:00:01.000Z', kind: 'approved', by: 'simon', data: { textSha256: target } });
  const st = queue(re).find((x) => x.textSha256 === target).state;
  const notes = notesFor(re);
  const S3 = { pass: mayGo(re, target) === false && st === 'denied' && notes.length === 1 && notes[0].note === 'too soon to offer; answer the question first', measured: `mayGo ${mayGo(re, target)} after a later approval; state ${st}; notes returned ${notes.length}` };
  // S4 — focus breaks only ties
  const t = Object.fromEntries(P4.leads.map((L) => [L.id, L.signal.text]));
  const r = { L6: (pickWithFocus(t.L6, 'digi') || {}).id, L1: (pickWithFocus(t.L1, 'digi') || {}).id, L2: (pickWithFocus(t.L2, 'digi') || {}).id, L3: (pickWithFocus(t.L3, 'liveware-pilot') || {}).id, L6other: (pickWithFocus(t.L6, 'liveware-pilot') || { id: null }).id };
  const S4 = { pass: r.L6 === 'digi' && r.L1 === 'liveware-pilot' && r.L2 === 'grow-a-brain' && r.L3 === 'digi' && r.L6other === null, measured: `L6 with focus digi → ${r.L6}; L1 → ${r.L1}; L2 → ${r.L2}; L3 with focus liveware-pilot → ${r.L3}; L6 with focus liveware-pilot → ${r.L6other}` };
  const claims = { S1, S2, S3, S4 };
  return { kind: 'ai-first-company-step6-oversight-run', seal: SEAL, gate: 'witness oversight 39/39', claims, held: Object.values(claims).filter((x) => x.pass).length, of: 4 };
}

const cmd = process.argv[2];
if (cmd === '--check') {
  if (git('show', `${SEAL}:${PREREG}`).replace(/\r\n/g, '\n').trim() !== readFileSync(file(PREREG), 'utf8').replace(/\r\n/g, '\n').trim()) { console.error('✗ the step 6 seal changed since ' + SEAL); process.exit(1); }
  console.error('✓ step 6 seal unchanged since ' + SEAL);
} else if (cmd === '--run' || cmd === '--verify') {
  const result = measure();
  const text = JSON.stringify(result, null, 1) + '\n';
  if (cmd === '--run') { writeFileSync(file(RUN), text); console.error(`✓ ${result.held} of 4 held`); for (const [k, x] of Object.entries(result.claims)) console.error(`  ${k} ${x.pass ? 'HELD' : 'FAILED'} · ${x.measured}`); }
  else { if (readFileSync(file(RUN), 'utf8').replace(/\r\n/g, '\n') !== text) { console.error('✗ step 6 does not re-measure to the committed receipt'); process.exit(1); } console.error(`✓ step 6 re-measured: ${result.held} of 4 held, identical to the committed receipt`); }
} else if (cmd) { console.error('step6-measure — --check | --run | --verify'); process.exit(2); }
