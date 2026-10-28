// step1-measure.mjs — the conductor's seven sealed claims (data/step1-conductor-prereg.json, sealed ebe3fae), measured.
//
//   node tools/step1-measure.mjs --check     the seal is byte-identical to the sealing commit
//   node tools/step1-measure.mjs --heldout   ask the local model for the held-out set (once, after the code is committed)
//   node tools/step1-measure.mjs --run       grade every claim → data/step1-conductor-run.json
//   node tools/step1-measure.mjs --verify    re-grade from the committed files; fail if anything differs (CI)
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

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
    // a heading alone on its line, or a heading in front of the item on the same line ("LEAVES: Offer a refund")
    const head = line.match(/^\**(leaves|stays)\**\s*:?\**\s*(.*)$/i);
    if (head) into = head[1].toLowerCase();
    const text = (head ? head[2] : line).replace(/^(\d+[.)]|[-*•])\s*/, '').trim();
    if (into && text) lists[into].push(text);
  }
  return lists;
}

export function grade(prereg, heldOut, karTasks, vendor, conduct) {
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

// The conductor exactly as it was at the commit the receipt names (later fixes are measured by their own seals).
async function conductorAt(commit) {
  const tmp = file(`src/.conductor-at-${commit.slice(0, 7)}.mjs`);
  writeFileSync(tmp, git('show', `${commit}:src/conductor.mjs`) + '\n');
  try { return (await import(tmp.href)).conduct; } finally { rmSync(tmp, { force: true }); }
}
function vendorCheck() {
  // the files step 1 vendored (kar-mind's controller and its wallet); later steps vendor more, which step 1 never claimed
  return readJSON('vendor/VENDOR.json').files.filter((f) => f.path.startsWith('vendor/kar-mind/')).map((f) => ({ path: f.path, ok: sha(readFileSync(file(f.path))) === f.sha256 }));
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
  // Asked for after the code is frozen. Ask 1 (2026-10-28) came back with 5 + 5 lines, not the 25 + 25 the sealed prompt asks
  // for, so — BEFORE any routing of it was looked at — the rule became: ask again with the same prompt until each list holds
  // 25 lines, keep every ask, drop exact repeats, measure once on the union. The receipt says so.
  const P = readJSON(PREREG);
  const codeCommit = git('log', '-1', '--format=%H', '--', 'src/conductor.mjs');
  if (git('status', '--porcelain', '--', 'src/conductor.mjs')) { console.error('✗ commit the conductor first: the held-out set is asked for after the code is frozen'); process.exit(1); }
  const H = existsSync(file(HELD)) ? readJSON(HELD) : null;
  const asks = H ? (H.asks || [{ askedAt: H.askedAt, seconds: H.seconds, reply: H.reply, leaves: H.leaves, stays: H.stays }]) : [];
  const union = (k) => [...new Set(asks.flatMap((a) => a[k]))];
  while (union('leaves').length < 25 || union('stays').length < 25) {
    if (asks.length >= 12) { console.error('✗ twelve asks and still short: stop and report it'); break; }
    const started = Date.now();
    const r = await fetch('http://localhost:11434/api/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: P.heldOut.model, stream: false, messages: [{ role: 'system', content: P.heldOut.system }, { role: 'user', content: P.heldOut.prompt }] }),
    });
    const j = await r.json();
    const reply = j.message && j.message.content;
    if (!reply) { console.error('✗ the local model gave no reply'); process.exit(1); }
    asks.push({ askedAt: new Date(started).toISOString(), seconds: Math.round((Date.now() - started) / 1000), reply, ...parseHeldOut(reply) });
    console.error(`  ask ${asks.length}: ${asks.at(-1).leaves.length} LEAVES, ${asks.at(-1).stays.length} STAYS`);
  }
  const karPrereg = JSON.parse(readFileSync(new URL('../../kar-mind/data/controller-prereg.json', import.meta.url), 'utf8'));
  const out = { model: P.heldOut.model, conductorCommit: codeCommit, rule: 'ask 1 returned 5 + 5 lines; before any routing was looked at, asked again with the same prompt until each list held 25 lines; every ask kept; exact repeats dropped; measured once on the union', asks, leaves: union('leaves'), stays: union('stays'), askedAt: asks[0].askedAt, karMindTasks: karPrereg.routing.tasks, karMindSeal: 'd24a454' };
  writeFileSync(file(HELD), JSON.stringify(out, null, 1) + '\n');
  console.error(`✓ held-out set: ${out.leaves.length} LEAVES, ${out.stays.length} STAYS from ${asks.length} asks`);
} else if (cmd === '--reparse') {
  // Ask 2 wrote its heading in front of every item ("LEAVES: Offer a refund"), which the first parser dropped (0 + 0).
  // The parser now reads that form too; the lists are re-derived from the kept raw replies, before any routing is looked at.
  const H = readJSON(HELD);
  for (const a of H.asks) Object.assign(a, parseHeldOut(a.reply));
  H.leaves = [...new Set(H.asks.flatMap((a) => a.leaves))];
  H.stays = [...new Set(H.asks.flatMap((a) => a.stays))];
  H.parserFix = 'ask 2 put the heading in front of every item; the parser was changed to read that form and every ask re-parsed from its kept reply, before any routing was looked at';
  writeFileSync(file(HELD), JSON.stringify(H, null, 1) + '\n');
  console.error(`✓ re-parsed ${H.asks.length} asks: ${H.leaves.length} LEAVES, ${H.stays.length} STAYS · per ask ${H.asks.map((a) => a.leaves.length + '+' + a.stays.length).join(', ')}`);
} else if (cmd === '--run' || cmd === '--verify') {
  const P = readJSON(PREREG), H = readJSON(HELD);
  const g = grade(P, H, karTasks(), vendorCheck(), await conductorAt(H.conductorCommit));
  const result = { kind: 'ai-first-company-step1-conductor-run', seal: SEAL, conductorCommit: H.conductorCommit, heldOutAskedAt: H.askedAt, claims: g.claims, held: Object.values(g.claims).filter((c) => c.pass === true).length, of: Object.keys(g.claims).length, rows: g.rows };
  const text = JSON.stringify(result, null, 1) + '\n';
  if (cmd === '--run') { writeFileSync(file(RUN), text); console.error(`✓ ${result.held} of ${result.of} held`); for (const [k, c] of Object.entries(g.claims)) console.error(`  ${k} ${c.pass ? 'HELD' : 'FAILED'} · ${c.measured}`); }
  else {
    const before = readFileSync(file(RUN), 'utf8').replace(/\r\n/g, '\n');
    if (before !== text) { console.error('✗ the step 1 receipt does not re-grade to the committed result'); process.exit(1); }
    console.error(`✓ step 1 re-graded: ${result.held} of ${result.of} held, identical to the committed receipt`);
  }
} else { console.error('step1-measure — --check | --heldout | --run | --verify'); process.exit(2); }
