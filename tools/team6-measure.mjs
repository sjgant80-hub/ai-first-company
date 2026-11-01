// team6-measure.mjs — the bot team, step 6 (the skill library): the sealed claims (data/team6-skills-prereg.json,
// sealed 34f57f6), measured once and kept.
//   node tools/team6-measure.mjs --check     the seal is unchanged
//   node tools/team6-measure.mjs --private   K5, once, on Kar's machine: the auditor's skill check on the real feed
//   node tools/team6-measure.mjs --run       every claim → data/team6-skills-run.json
//   node tools/team6-measure.mjs --verify    re-measure; must equal the committed receipt
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { generateKeyPairSync, sign, verify as edVerify } from 'node:crypto';
import { AGENTS, PERSONAS, entry, read, append, signingText } from '../src/feed.mjs';
import { verdicts } from '../src/auditor.mjs';
import { frontmatter, folderSha, entryFor, problems, refOf, usable, llms } from '../src/skills.mjs';
import { folders, catalogNow, shaText, ROOT } from './skills.mjs';

const SEAL = '34f57f6';
const root = new URL('../', import.meta.url);
const file = (p) => new URL(p, root);
const readJSON = (p) => JSON.parse(readFileSync(file(p), 'utf8'));
const PREREG = 'data/team6-skills-prereg.json', RUN = 'data/team6-skills-run.json', PRIV = 'data/team6-private.json';
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });
const lf = (t) => t.replace(/\r\n/g, '\n');
const TS = '2026-11-01T23:45:00Z';

const KEYS = Object.fromEntries(AGENTS.map((a) => [a, generateKeyPairSync('ed25519')]));
const signAs = (line, who) => ({ ...line, sig: sign(null, Buffer.from(signingText(line)), KEYS[who].privateKey).toString('base64') });
const sigOk = (x) => typeof x.sig === 'string' && AGENTS.includes(x.agent) && edVerify(null, Buffer.from(signingText(x)), KEYS[x.agent].publicKey, Buffer.from(x.sig, 'base64'));
/** a verdict map from real lines: PASSes on these refs, signed by the auditor's key (or, when forged, by the builder's) */
const passes = (refs, signer = 'auditor') => { let f = ''; for (const ref of refs) { const out = entry({ ts: TS, agent: 'auditor', kind: 'receipt', verdict: 'PASS', ref, what: 'PASS on a skill', link: 'skills' }); f = append(f, signer ? signAs(out.line, signer) : out.line); } return verdicts(read(f, sigOk).lines); };

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function measure() {
  const F = folders(), cat = catalogNow(), committed = JSON.parse(lf(readFileSync(file('skills/catalog.json'), 'utf8')));
  // K1
  const whole = cat.skills.filter((e) => e.named === e.name && Object.values(e.has).every((v) => v === true) && PERSONAS.includes(e.owner) && e.callers.length > 0).length;
  const probs = problems(cat);
  const K1 = { pass: cat.skills.length === 4 && whole === 4 && probs.length === 0, measured: `${whole} of ${cat.skills.length} skills whole (${cat.skills.map((e) => `${e.name}: owner ${e.owner}, ${e.callers.length} caller${e.callers.length === 1 ? '' : 's'}`).join('; ')}); problems ${probs.length}`, problems: probs };
  // K2
  const sameCat = lf(readFileSync(file('skills/catalog.json'), 'utf8')) === JSON.stringify(cat, null, 1) + '\n';
  const sameLlms = lf(readFileSync(file('skills/llms.txt'), 'utf8')) === llms(cat);
  const pinsEqual = F.filter((f) => (committed.skills.find((x) => x.name === f.name) || {}).sha256 === folderSha(f.files.map((x) => ({ path: x.path, sha256: x.sha256 })))).length;
  const listed = [...lf(readFileSync(file('skills/llms.txt'), 'utf8')).matchAll(/^- \[([a-z0-9-]+)\]/gm)].map((m) => m[1]);
  const K2 = { pass: sameCat && sameLlms && pinsEqual === F.length && JSON.stringify(listed) === JSON.stringify(committed.skills.map((e) => e.name)), measured: `catalog.json ${sameCat ? 'is' : 'is NOT'} what the folders make; llms.txt ${sameLlms ? 'is' : 'is NOT'}; ${pinsEqual} of ${F.length} pins equal their folder's hash; llms.txt lists ${listed.length} skills, ${JSON.stringify(listed) === JSON.stringify(committed.skills.map((e) => e.name)) ? 'exactly the catalog' : 'NOT the catalog'}` };
  // K3 — every file of every skill, one byte changed (in memory), then undone
  let changes = 0, refused = 0, restored = 0;
  for (const f of F) {
    const e = entryFor(f), V = passes([refOf(e.name, e.sha256)]);
    for (const x of f.files) {
      const bent = f.files.map((y) => ({ path: y.path, sha256: y === x ? shaText(y.text + ' ') : y.sha256 }));
      changes++;
      const r = usable(e, folderSha(bent), e.owner, V);
      if (!r.ok && r.why === 'changed since its pin: it must pass the auditor again') refused++;
      if (usable(e, folderSha(f.files.map((y) => ({ path: y.path, sha256: y.sha256 }))), e.owner, V).ok) restored++;
    }
  }
  const K3 = { pass: changes > 0 && refused === changes && restored === changes, measured: `${refused} of ${changes} one-byte changes (every file of every skill) refused even with the old PASS; ${restored} of ${changes} usable again once undone` };
  // K4 — callers fenced; an unsigned or forged PASS, or one at another hash, counts for nothing
  let pairs = 0, right = 0;
  const bad = [];
  for (const e of cat.skills) {
    const V = passes([refOf(e.name, e.sha256)]);
    for (const p of PERSONAS) { pairs++; const ok = usable(e, e.sha256, p, V).ok; if (ok === e.callers.includes(p)) right++; else bad.push(`${e.name}/${p}`); }
    const caller = e.callers[0];
    for (const [label, V2] of [['unsigned', passes([refOf(e.name, e.sha256)], null)], ['forged', passes([refOf(e.name, e.sha256)], 'builder')], ['other hash', passes([refOf(e.name, 'f'.repeat(64))])]]) { pairs++; if (!usable(e, e.sha256, caller, V2).ok) right++; else bad.push(`${e.name}/${label}`); }
  }
  const K4 = { pass: right === pairs && bad.length === 0, measured: `${right} of ${pairs} as stated (each persona × skill with a signed PASS, plus an unsigned, a forged and an other-hash PASS per skill)`, bad };
  // K5 — from the real feed (Kar's machine)
  const priv = existsSync(file(PRIV)) ? readJSON(PRIV) : null;
  const K5 = priv ? { pass: priv.pass, measured: priv.measured, ci: false } : { pass: false, measured: "not measured (run --private on Kar's machine)" };
  // K6 — total
  const r = rng(606), int = (n) => Math.floor(r() * n), pick = (a) => a[int(a.length)];
  const junk = () => pick([null, undefined, 0, 7, true, '', 'x', '---\nname: x\n---', [], {}, [{ path: 'a', sha256: 'a'.repeat(64) }], { skills: [null] }, { skills: 'x' }, { name: 'x', files: [null] }, { sha256: 'a'.repeat(64), callers: ['kar'] }, 'kar', NaN]);
  let throws = 0, yes = 0, calls = 0;
  for (let i = 0; i < 500; i++) {
    for (const fn of [() => frontmatter(junk()), () => folderSha(junk()), () => problems(junk()), () => llms(junk()), () => entryFor(junk()), () => { const u = usable(junk(), junk(), pick(PERSONAS), junk()); if (u.ok) yes++; }]) { calls++; try { fn(); } catch { throws++; } }
  }
  const K6 = { pass: throws === 0 && yes === 0 && calls === 3000, measured: `${calls} fuzzed calls: ${throws} threw; ${yes} said yes without a PASS` };
  const claims = { K1, K2, K3, K4, K5, K6 };
  return { kind: 'ai-first-company-team6-skills-run', seal: SEAL, catalog: shaText(lf(readFileSync(file('skills/catalog.json'), 'utf8'))), claims, held: Object.values(claims).filter((x) => x.pass).length, of: 6 };
}

async function privateRun() {
  if (existsSync(file(PRIV))) { console.error('✗ already measured, and kept: ' + PRIV); process.exit(1); }
  const { REPO, isSigned } = await import('./team.mjs');
  const feed = () => read(readFileSync(`${REPO}/.estate/feed.jsonl`, 'utf8'), isSigned).lines;
  const before = feed().length;
  const a = spawnSync('node', ['tools/skills.mjs', '--audit', '--write'], { cwd: ROOT, encoding: 'utf8', timeout: 900000 });
  const L = feed(), added = L.slice(before), V = verdicts(L), cat = catalogNow();
  const signedPasses = added.filter((x) => x.agent === 'auditor' && x.verdict === 'PASS' && x.signed === true).length;
  const usableBy = cat.skills.map((e) => e.callers.every((p) => usable(e, e.sha256, p, V).ok)).filter(Boolean).length;
  const out = { pass: a.status === 0 && added.length === 4 && signedPasses === 4 && usableBy === 4, measured: `the auditor's skill check re-ran each skill's tests and wrote ${added.length} lines: ${added.map((x) => x.verdict).join(', ')}, ${signedPasses} signed PASSes bound to each skill's hash; ${usableBy} of 4 skills now usable by every one of their callers (measured on Kar's machine; the feed is private)`, printed: a.stdout.trim().split('\n'), at: new Date().toISOString().slice(0, 10) };
  writeFileSync(file(PRIV), JSON.stringify(out, null, 1) + '\n');
  console.error((out.pass ? 'HELD' : 'FAILED') + ' · ' + out.measured);
}

const cmd = process.argv[2];
if (cmd === '--check') {
  if (git('show', `${SEAL}:${PREREG}`).replace(/\r\n/g, '\n').trim() !== readFileSync(file(PREREG), 'utf8').replace(/\r\n/g, '\n').trim()) { console.error('✗ the step 6 seal changed since ' + SEAL); process.exit(1); }
  console.error('✓ step 6 seal unchanged since ' + SEAL);
} else if (cmd === '--private') await privateRun();
else if (cmd === '--run' || cmd === '--verify') {
  const result = measure(), out = JSON.stringify(result, null, 1) + '\n';
  if (cmd === '--run') { writeFileSync(file(RUN), out); console.error(`✓ ${result.held} of 6 held`); for (const [k, x] of Object.entries(result.claims)) console.error(`  ${k} ${x.pass ? 'HELD' : 'FAILED'} · ${x.measured}`); }
  else { if (lf(readFileSync(file(RUN), 'utf8')) !== out) { console.error('✗ step 6 does not re-measure to the committed receipt'); process.exit(1); } console.error(`✓ step 6 re-measured: ${result.held} of 6 held, identical to the committed receipt`); }
} else if (cmd) { console.error('team6-measure — --check | --private | --run | --verify'); process.exit(2); }
