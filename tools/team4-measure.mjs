// team4-measure.mjs — the bot team, step 4 (wire the existing bots): the sealed claims (data/team4-wire-prereg.json,
// sealed 9777f2f), measured once on Kar's machine and kept. Every claim touches the team's private shared repo, so CI
// checks the seal and that the receipt reads; it cannot re-run them.
//   node tools/team4-measure.mjs --check | --run | --verify
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, copyFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SEAL = '9777f2f';
const root = new URL('../', import.meta.url);
const file = (p) => new URL(p, root);
const here = new URL('.', root).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const PREREG = 'data/team4-wire-prereg.json', RUN = 'data/team4-wire-run.json';
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });
const node = (args, env = {}, cwd = here) => spawnSync('node', args, { cwd, encoding: 'utf8', timeout: 900000, env: { ...process.env, ...env } });

async function run() {
  const { REPO, isSigned } = await import('./team.mjs');
  const { read } = await import('../src/feed.mjs');
  const { HEAD } = await import('../src/rollup.mjs');
  const feedPath = join(REPO, '.estate', 'feed.jsonl'), rollPath = join(REPO, 'plans', 'AGENT_FEED.md');
  const lines = () => read(readFileSync(feedPath, 'utf8'), isSigned).lines;

  // W4 first, on a scratch copy: Grok Bot's path, followed from the cards, before Grok Bot uses it
  const tmp = mkdtempSync(join(tmpdir(), 'team4-')), clone = join(tmp, 'ai-first-company'), shared = join(tmp, 'shared');
  const cl = spawnSync('git', ['clone', '--depth', '1', '--quiet', 'https://github.com/sjgant80-hub/ai-first-company.git', clone], { encoding: 'utf8', timeout: 120000 });
  mkdirSync(join(shared, '.estate'), { recursive: true }); mkdirSync(join(shared, 'team'), { recursive: true });
  writeFileSync(join(shared, '.estate', 'feed.jsonl'), '');
  copyFileSync(join(REPO, 'team', 'keys.json'), join(shared, 'team', 'keys.json'));
  const env = { KAR_CONTINUITY: shared };
  const m = node(['tools/team.mjs', 'add', '--agent', 'money-time', '--kind', 'listing', '--what', 'kar-tally Agensi listing draft ready for review', '--link', 'https://e.example/drafts/kar-tally'], env, clone);
  const c = node(['tools/team.mjs', 'add', '--agent', 'card-keeper', '--kind', 'receipt', '--what', 'Forged and verified the card of the day', '--link', 'https://e.example/cards/today'], env, clone);
  const roll = node(['tools/team.mjs', 'rollup'], env, clone).stdout || '';
  const aud = node(['tools/audit.mjs'], env, clone).stdout || '';
  const scratch = read(readFileSync(join(shared, '.estate', 'feed.jsonl'), 'utf8')).lines;
  const listing = scratch.find((x) => x.agent === 'money-time'), cardLine = scratch.find((x) => x.agent === 'card-keeper');
  const judged = (id) => new RegExp('^(PASS|FLAG|FAIL) ' + id.slice(0, 12) + '[^\\n]*\\n(?:\\s{7}[^\\n]*\\n)*?\\s{7}ok\\s+tools:', 'm').test(aud);
  const W4ok = cl.status === 0 && m.status === 0 && c.status === 0 && listing && cardLine && listing.needs_owner === true && roll.includes('### Money time (1)') && roll.includes('### Card Keeper (1)') && judged(listing.id) && judged(cardLine.id) && !existsSync(join(shared, '.git'));
  const W4 = { pass: Boolean(W4ok), measured: `a fresh clone of the public repo writing to a scratch shared repo (no git, so nothing can be pushed): the Money time listing ${listing ? 'stored, needs_owner ' + listing.needs_owner + (listing.flags.length ? ', flags ' + listing.flags.join(', ') : '') : 'NOT stored'}; the Card Keeper receipt ${cardLine ? 'stored' + (cardLine.flags.length ? ', flags ' + cardLine.flags.join(', ') : '') : 'NOT stored'}; the rollup shows ${['Money time', 'Card Keeper'].filter((n) => roll.includes('### ' + n + ' (1)')).join(' and ') || 'neither'}; the auditor judged ${[listing, cardLine].filter((x) => x && judged(x.id)).length} of 2 with the tools check ok`, auditor: aud.trim().split('\n') };

  // W2 + W3: the Builder's lines pinned by construction, and the auditor judging each new line once
  const before = lines().length;
  const b1 = node(['tools/team.mjs', 'add', '--agent', 'builder', '--kind', 'build', '--what', 'Bot team step 3 (the auditor) measured once: see the receipt for every claim, held and failed', '--receipt-file', 'data/team3-auditor-run.json']);
  const b2 = node(['tools/team.mjs', 'add', '--agent', 'builder', '--kind', 'receipt', '--what', 'Witness v0.6 on the five team kernels: feed 137 of 137, rollup 38 of 38, roster 72 of 72, cards 15 of 15, auditor 73 of 73, all clean', '--receipt-file', 'data/team-witness.json']);
  const newIds = lines().slice(before).map((x) => x.id);
  const a1 = node(['tools/audit.mjs', '--write']), afterFirst = lines();
  const a2 = node(['tools/audit.mjs', '--write']), afterSecond = lines();
  const verdictsOn = (L, id) => L.filter((x) => x.agent === 'auditor' && x.ref === id && x.signed === true);
  const once = newIds.every((id) => verdictsOn(afterFirst, id).length === 1) && afterSecond.length === afterFirst.length;
  const W3 = { pass: b1.status === 0 && b2.status === 0 && newIds.length === 2 && once && a1.status === 0 && a2.status === 0, measured: `${newIds.length} new builder lines; the first audit run wrote ${afterFirst.length - before - newIds.length} signed verdicts (${newIds.map((id) => verdictsOn(afterFirst, id).length).join(' and ')} on the new lines), the second wrote ${afterSecond.length - afterFirst.length}` };
  const rec = newIds.map((id) => { const v = verdictsOn(afterFirst, id)[0]; return { id: id.slice(0, 12), verdict: v ? v.verdict : null, evidence: v ? v.evidence : [] }; });
  const pinned = rec.filter((r) => r.evidence.some((e) => /^receipt ok: re-hashed/.test(e)) && !r.evidence.some((e) => /^receipt FAIL/.test(e)));
  const W2 = { pass: pinned.length === newIds.length && newIds.length === 2, measured: `${pinned.length} of ${newIds.length} builder lines re-hash at their pinned commit; verdicts ${rec.map((r) => r.verdict).join(', ')}`, verdicts: rec };

  // W1: Kar's rollup in AGENT_FEED.md, above every Grok Bot sync, the syncs untouched, idempotent
  const md0 = readFileSync(rollPath, 'utf8').replace(/\r\n/g, '\n');
  const r1 = node(['tools/team.mjs', 'rollup', '--write']), md1 = readFileSync(rollPath, 'utf8').replace(/\r\n/g, '\n');
  const r2 = node(['tools/team.mjs', 'rollup', '--write']), md2 = readFileSync(rollPath, 'utf8').replace(/\r\n/g, '\n');
  const sections = (t) => t.split(/\n(?=## )/).filter((s) => !s.startsWith(HEAD)).map((s) => s.replace(/\n+$/, ''));
  const at = md1.indexOf(HEAD), firstSync = md1.indexOf('\n## Synced');
  const ours = md1.slice(at).split(/\n(?=## )/)[0];
  const W1ok = r1.status === 0 && r2.status === 0 && at >= 0 && (firstSync < 0 || at < firstSync) && ours.indexOf('### NEEDS SIMON') >= 0 && ours.indexOf('### NEEDS SIMON') < ours.search(/### (?!NEEDS SIMON)/) && JSON.stringify(sections(md1)) === JSON.stringify(sections(md0)) && md2 === md1;
  const W1 = { pass: Boolean(W1ok), measured: `Kar's rollup is ${at >= 0 && (firstSync < 0 || at < firstSync) ? 'above every Grok Bot sync' : 'NOT above the syncs'}; NEEDS SIMON ${ours.indexOf('### NEEDS SIMON') >= 0 ? 'first' : 'missing'} (${(/### NEEDS SIMON \((\d+)\)/.exec(ours) || [, '?'])[1]} waiting); the ${sections(md0).length} other sections ${JSON.stringify(sections(md1)) === JSON.stringify(sections(md0)) ? 'unchanged byte for byte' : 'CHANGED'}; writing it again ${md2 === md1 ? 'changed nothing' : 'CHANGED the file'}` };

  const claims = { W1, W2, W3, W4 };
  return { kind: 'ai-first-company-team4-wire-run', seal: SEAL, ci: false, at: new Date().toISOString().slice(0, 10), claims, held: Object.values(claims).filter((x) => x.pass).length, of: 4 };
}

const cmd = process.argv[2];
if (cmd === '--check') {
  if (git('show', `${SEAL}:${PREREG}`).replace(/\r\n/g, '\n').trim() !== readFileSync(file(PREREG), 'utf8').replace(/\r\n/g, '\n').trim()) { console.error('✗ the step 4 seal changed since ' + SEAL); process.exit(1); }
  console.error('✓ step 4 seal unchanged since ' + SEAL);
} else if (cmd === '--run') {
  if (existsSync(file(RUN))) { console.error('✗ already measured, and kept: ' + RUN); process.exit(1); }
  const result = await run();
  writeFileSync(file(RUN), JSON.stringify(result, null, 1) + '\n');
  console.error(`✓ ${result.held} of 4 held`); for (const [k, x] of Object.entries(result.claims)) console.error(`  ${k} ${x.pass ? 'HELD' : 'FAILED'} · ${x.measured}`);
} else if (cmd === '--verify') {
  const r = JSON.parse(readFileSync(file(RUN), 'utf8'));
  const ok = r.seal === SEAL && r.of === 4 && r.held === Object.values(r.claims).filter((x) => x.pass).length;
  console.error(ok ? `✓ step 4's receipt reads: ${r.held} of 4 held (measured on Kar's machine ${r.at}; the shared repo is private, so CI cannot re-run it)` : '✗ step 4\'s receipt does not add up'); process.exit(ok ? 0 : 1);
} else if (cmd) { console.error('team4-measure — --check | --run | --verify'); process.exit(2); }
