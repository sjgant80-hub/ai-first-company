// step1-measure.mjs — the conductor's seven sealed claims (data/step1-conductor-prereg.json, sealed ebe3fae), measured.
//
//   node tools/step1-measure.mjs --check     the seal is byte-identical to the sealing commit
//   node tools/step1-measure.mjs --heldout   ask the local model for the held-out set (once, after the code is committed)
//   node tools/step1-measure.mjs --run       grade every claim → data/step1-conductor-run.json
//   node tools/step1-measure.mjs --verify    re-grade from the committed files; fail if anything differs (CI)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { conduct } from '../src/conductor.mjs';

const SEAL = 'ebe3fae';
const root = new URL('../', import.meta.url);
const file = (p) => new URL(p, root);
const readJSON = (p) => JSON.parse(readFileSync(file(p), 'utf8'));
const sha = (b) => createHash('sha256').update(b).digest('hex');
const PREREG = 'data/step1-conductor-prereg.json', HELD = 'data/step1-heldout.json', RUN = 'data/step1-conductor-run.json';
const BUDGET = { left: 100000, ceiling: 30000 };   // a night with budget left, so the controller's own tiers are the ones it seals
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();

/** The model's reply split under its two headings, exactly as written (numbering or bullets stripped, nothing else). */
export function parseHeldOut(reply) {
  const lists = { leaves: [], stays: [] };
  let into = null;
  for (const raw of String(reply).split(/\r?\n/)) {
    const line = raw.trim();
    if (/^leaves\s*:?$/i.test(line)) { into = 'leaves'; continue; }
    if (/^stays\s*:?$/i.test(line)) { into = 'stays'; continue; }
    const text = line.replace(/^(\d+[.)]|[-*•])\s*/, '').trim();
    if (into && text) lists[into].push(text);
  }
  return lists;
}

export function grade(prereg, heldOut, karTasks, vendor) {
  const S = prereg.sets;
  const lane = (job, o) => conduct(job, o || BUDGET);
  const rows = (arr, want, o) => arr.map((w) => { const r = lane({ words: w }, o); return { words: w, lane: r.lane, wait: r.wait, why: r.why, ok: want(r) }; });
  const outward = rows(S.outward, (r) => r.lane === 'simon');
  const internal = rows(S.internal, (r) => r.lane !== 'simon');
  const reach = rows(S.reach, (r) => r.lane === 'grok' && r.wait === true);
  const reachBooted = rows(S.reach, (r) => r.lane === 'grok' && r.wait === false, { ...BUDGET, grok: true });
  const structured = S.structured.map((s) => { const r = lane(s.job); return { job: s.job, lane: r.lane, ok: r.lane === s.lane }; });
  const kar = karTasks.map(([w, tier]) => { const r = lane({ words: w }); return { words: w, sealed: tier, lane: r.lane, ok: r.lane === tier }; });
  const leaves = heldOut ? rows(heldOut.leaves, (r) => r.lane === 'simon') : null;
  const stays = heldOut ? rows(heldOut.stays, (r) => r.lane !== 'simon') : null;
  const n = (a) => a.filter((x) => x.ok).length;
  const toSimon = (a) => a.filter((x) => x.lane === 'simon').length;
  const claims = {
    C1: { pass: n(outward) === S.outward.length, measured: `${n(outward)} of ${S.outward.length} to simon` },
    C2: { pass: toSimon(internal) <= 3, measured: `${toSimon(internal)} of ${S.internal.length} to simon` },
    C3: { pass: vendor.every((v) => v.ok) && n(kar) === karTasks.length, measured: `${vendor.filter((v) => v.ok).length} of ${vendor.length} vendored files byte-identical; ${n(kar)} of ${karTasks.length} kar-mind tasks on their sealed tier` },
    C4: { pass: n(reachBooted) === S.reach.length && n(reach) === S.reach.length, measured: `${n(reachBooted)} of ${S.reach.length} to grok when booted; ${n(reach)} of ${S.reach.length} wait when not` },
    C5: { pass: n(structured) === S.structured.length, measured: `${n(structured)} of ${S.structured.length} to simon` },
    C6: leaves ? { pass: leaves.length > 0 && n(leaves) === leaves.length, measured: `${leaves.length - n(leaves)} leaks among ${leaves.length} LEAVES lines` } : { pass: null, measured: 'not yet measured' },
    C7: stays ? { pass: stays.length > 0 && toSimon(stays) <= 3, measured: `${toSimon(stays)} of ${stays.length} STAYS lines to simon` } : { pass: null, measured: 'not yet measured' },
  };
  return { claims, rows: { outward, internal, reach, reachBooted, structured, kar, leaves, stays }, vendor };
}

function vendorCheck() {
  return readJSON('vendor/VENDOR.json').files.map((f) => ({ path: f.path, ok: sha(readFileSync(file(f.path))) === f.sha256 }));
}
function karTasks() {
  // kar-mind's sealed routing tasks, copied into the held-out file at measure time so CI needs no sibling checkout
  return readJSON(HELD).karMindTasks;
}

const cmd = process.argv[2];
if (cmd === '--check') {
  const sealed = git('show', `${SEAL}:${PREREG}`);
  const now = readFileSync(file(PREREG), 'utf8');
  if (sealed.replace(/\r\n/g, '\n').trim() !== now.replace(/\r\n/g, '\n').trim()) { console.error('✗ the step 1 seal changed since ' + SEAL); process.exit(1); }
  console.error('✓ step 1 seal unchanged since ' + SEAL);
} else if (cmd === '--heldout') {
  if (existsSync(file(HELD))) { console.error('✗ the held-out set already exists: it is asked for once'); process.exit(1); }
  const P = readJSON(PREREG);
  const codeCommit = git('log', '-1', '--format=%H', '--', 'src/conductor.mjs');
  if (git('status', '--porcelain', '--', 'src/conductor.mjs')) { console.error('✗ commit the conductor first: the held-out set is asked for after the code is frozen'); process.exit(1); }
  const started = Date.now();
  const r = await fetch('http://localhost:11434/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: P.heldOut.model, stream: false, messages: [{ role: 'system', content: P.heldOut.system }, { role: 'user', content: P.heldOut.prompt }] }),
  });
  const j = await r.json();
  const reply = j.message && j.message.content;
  if (!reply) { console.error('✗ the local model gave no reply'); process.exit(1); }
  const karPrereg = JSON.parse(readFileSync(new URL('../../kar-mind/data/controller-prereg.json', import.meta.url), 'utf8'));
  const out = { model: P.heldOut.model, askedAt: new Date(started).toISOString(), seconds: Math.round((Date.now() - started) / 1000), conductorCommit: codeCommit, reply, ...parseHeldOut(reply), karMindTasks: karPrereg.routing.tasks, karMindSeal: 'd24a454' };
  writeFileSync(file(HELD), JSON.stringify(out, null, 1) + '\n');
  console.error(`✓ held-out set: ${out.leaves.length} LEAVES, ${out.stays.length} STAYS (${out.seconds} s)`);
} else if (cmd === '--run' || cmd === '--verify') {
  const P = readJSON(PREREG), H = readJSON(HELD);
  const g = grade(P, H, karTasks(), vendorCheck());
  const result = { kind: 'ai-first-company-step1-conductor-run', seal: SEAL, conductorCommit: H.conductorCommit, heldOutAskedAt: H.askedAt, claims: g.claims, held: Object.values(g.claims).filter((c) => c.pass === true).length, of: Object.keys(g.claims).length, rows: g.rows };
  const text = JSON.stringify(result, null, 1) + '\n';
  if (cmd === '--run') { writeFileSync(file(RUN), text); console.error(`✓ ${result.held} of ${result.of} held`); for (const [k, c] of Object.entries(g.claims)) console.error(`  ${k} ${c.pass ? 'HELD' : 'FAILED'} · ${c.measured}`); }
  else {
    const before = readFileSync(file(RUN), 'utf8').replace(/\r\n/g, '\n');
    if (before !== text) { console.error('✗ the step 1 receipt does not re-grade to the committed result'); process.exit(1); }
    console.error(`✓ step 1 re-graded: ${result.held} of ${result.of} held, identical to the committed receipt`);
  }
} else { console.error('step1-measure — --check | --heldout | --run | --verify'); process.exit(2); }
