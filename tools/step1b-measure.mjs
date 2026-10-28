// step1b-measure.mjs — the fail-closed conductor's three sealed claims (data/step1b-prereg.json, sealed 1456837), measured.
//
//   node tools/step1b-measure.mjs --check     the seal is unchanged since the sealing commit
//   node tools/step1b-measure.mjs --heldout   ask the local model for a FRESH held-out set (after the fix is committed)
//   node tools/step1b-measure.mjs --run       grade → data/step1b-conductor-run.json
//   node tools/step1b-measure.mjs --verify    re-grade from the committed files, with the conductor at the receipt's commit (CI)
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const SEAL = '1456837';
const root = new URL('../', import.meta.url);
const file = (p) => new URL(p, root);
const readJSON = (p) => JSON.parse(readFileSync(file(p), 'utf8'));
const sha = (b) => createHash('sha256').update(b).digest('hex');
const PREREG = 'data/step1b-prereg.json', STEP1 = 'data/step1-conductor-prereg.json', STEP1HELD = 'data/step1-heldout.json';
const HELD = 'data/step1b-heldout.json', RUN = 'data/step1b-conductor-run.json';
const BUDGET = { left: 100000, ceiling: 30000 };
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();

/** The same reading of the model's reply step 1 settled on: a heading alone, or in front of the item on its own line. */
function parseHeldOut(reply) {
  const lists = { leaves: [], stays: [] };
  let into = null;
  for (const raw of String(reply).split(/\r?\n/)) {
    const line = raw.trim();
    const head = line.match(/^\**(leaves|stays)\**\s*:?\**\s*(.*)$/i);
    if (head) into = head[1].toLowerCase();
    const text = (head ? head[2] : line).replace(/^(\d+[.)]|[-*•])\s*/, '').trim();
    if (into && text) lists[into].push(text);
  }
  return lists;
}

async function conductorAt(commit) {
  const tmp = file(`src/.conductor-at-${commit.slice(0, 7)}.mjs`);
  writeFileSync(tmp, git('show', `${commit}:src/conductor.mjs`) + '\n');
  try { return (await import(tmp.href)).conduct; } finally { rmSync(tmp, { force: true }); }
}

function grade(S1, karTasks, H, vendor, conduct) {
  const S = S1.sets;
  const lane = (job, o) => conduct(job, o || BUDGET);
  const rows = (arr, want, o) => arr.map((w) => { const r = lane({ words: w }, o); return { words: w, lane: r.lane, wait: r.wait, why: r.why, ok: want(r) }; });
  const n = (a) => a.filter((x) => x.ok).length;
  const toSimon = (a) => a.filter((x) => x.lane === 'simon').length;
  const outward = rows(S.outward, (r) => r.lane === 'simon');
  const internal = rows(S.internal, (r) => r.lane !== 'simon');
  const reach = rows(S.reach, (r) => r.lane === 'grok' && r.wait === true);
  const reachBooted = rows(S.reach, (r) => r.lane === 'grok' && r.wait === false, { ...BUDGET, grok: true });
  const structured = S.structured.map((s) => { const r = lane(s.job); return { job: s.job, lane: r.lane, ok: r.lane === s.lane }; });
  const kar = karTasks.map(([w, tier]) => { const r = lane({ words: w }); return { words: w, sealed: tier, lane: r.lane, ok: r.lane === tier }; });
  const leaves = rows(H.leaves, (r) => r.lane === 'simon');
  const stays = rows(H.stays, (r) => r.lane !== 'simon');
  const b1 = n(outward) === S.outward.length && toSimon(internal) <= 3 && vendor.every((v) => v.ok) && n(kar) === karTasks.length
    && n(reach) === S.reach.length && n(reachBooted) === S.reach.length && n(structured) === S.structured.length;
  const claims = {
    B1: { pass: b1, measured: `outward ${n(outward)} of ${S.outward.length} to simon; internal ${toSimon(internal)} of ${S.internal.length} to simon; kar-mind ${n(kar)} of ${karTasks.length} on their tier; X reading ${n(reachBooted)} of ${S.reach.length} to grok, ${n(reach)} wait unbooted; structured ${n(structured)} of ${S.structured.length} to simon; vendored ${vendor.filter((v) => v.ok).length} of ${vendor.length} byte-identical` },
    B2: { pass: leaves.length > 0 && n(leaves) === leaves.length, measured: `${leaves.length - n(leaves)} leaks among ${leaves.length} fresh LEAVES lines` },
    B3: { pass: stays.length > 0 && toSimon(stays) * 5 <= stays.length, measured: `${toSimon(stays)} of ${stays.length} fresh STAYS lines to simon (${Math.round((100 * toSimon(stays)) / stays.length)}%)` },
  };
  return { claims, rows: { leaves, stays, outward, internal, kar } };
}

const cmd = process.argv[2];
if (cmd === '--check') {
  const sealed = git('show', `${SEAL}:${PREREG}`);
  if (sealed.replace(/\r\n/g, '\n').trim() !== readFileSync(file(PREREG), 'utf8').replace(/\r\n/g, '\n').trim()) { console.error('✗ the step 1b seal changed since ' + SEAL); process.exit(1); }
  console.error('✓ step 1b seal unchanged since ' + SEAL);
} else if (cmd === '--heldout') {
  if (existsSync(file(HELD))) { console.error('✗ the fresh held-out set already exists: it is asked for once'); process.exit(1); }
  if (git('status', '--porcelain', '--', 'src/conductor.mjs')) { console.error('✗ commit the fixed conductor first'); process.exit(1); }
  const S1 = readJSON(STEP1);
  const codeCommit = git('log', '-1', '--format=%H', '--', 'src/conductor.mjs');
  const asks = [];
  const union = (k) => [...new Set(asks.flatMap((a) => a[k]))];
  while (union('leaves').length < 25 || union('stays').length < 25) {
    if (asks.length >= 12) { console.error('✗ twelve asks and still short: stop and report it'); break; }
    const started = Date.now();
    const r = await fetch('http://localhost:11434/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: S1.heldOut.model, stream: false, messages: [{ role: 'system', content: S1.heldOut.system }, { role: 'user', content: S1.heldOut.prompt }] }) });
    const j = await r.json();
    const reply = j.message && j.message.content;
    if (!reply) { console.error('✗ the local model gave no reply'); process.exit(1); }
    asks.push({ askedAt: new Date(started).toISOString(), seconds: Math.round((Date.now() - started) / 1000), reply, ...parseHeldOut(reply) });
    console.error(`  ask ${asks.length}: ${asks.at(-1).leaves.length} LEAVES, ${asks.at(-1).stays.length} STAYS`);
  }
  writeFileSync(file(HELD), JSON.stringify({ model: S1.heldOut.model, prompt: 'the step 1 sealed held-out prompt, unchanged', conductorCommit: codeCommit, asks, leaves: union('leaves'), stays: union('stays') }, null, 1) + '\n');
  console.error(`✓ fresh held-out set: ${union('leaves').length} LEAVES, ${union('stays').length} STAYS from ${asks.length} asks`);
} else if (cmd === '--run' || cmd === '--verify') {
  const H = readJSON(HELD);
  const vendor = readJSON('vendor/VENDOR.json').files.filter((f) => f.path.startsWith('vendor/kar-mind/')).map((f) => ({ path: f.path, ok: sha(readFileSync(file(f.path))) === f.sha256 }));
  const g = grade(readJSON(STEP1), readJSON(STEP1HELD).karMindTasks, H, vendor, await conductorAt(H.conductorCommit));
  const result = { kind: 'ai-first-company-step1b-conductor-run', seal: SEAL, conductorCommit: H.conductorCommit, claims: g.claims, held: Object.values(g.claims).filter((c) => c.pass).length, of: 3, rows: g.rows };
  const text = JSON.stringify(result, null, 1) + '\n';
  if (cmd === '--run') { writeFileSync(file(RUN), text); console.error(`✓ ${result.held} of 3 held`); for (const [k, c] of Object.entries(g.claims)) console.error(`  ${k} ${c.pass ? 'HELD' : 'FAILED'} · ${c.measured}`); }
  else {
    if (readFileSync(file(RUN), 'utf8').replace(/\r\n/g, '\n') !== text) { console.error('✗ the step 1b receipt does not re-grade to the committed result'); process.exit(1); }
    console.error(`✓ step 1b re-graded: ${result.held} of 3 held, identical to the committed receipt`);
  }
} else { console.error('step1b-measure — --check | --heldout | --run | --verify'); process.exit(2); }
