#!/usr/bin/env node
// skills.mjs — the team's skill library: build its one index from the folders, check it, and run the auditor's skill
// check. A skill's pin is the SHA-256 over its files (line endings counted as LF, so every machine pins the same bytes).
//   node tools/skills.mjs                    write skills/catalog.json and skills/llms.txt from the folders
//   node tools/skills.mjs --check            they are exactly what the folders make (exit 1 if not)
//   node tools/skills.mjs --receipts         write each skill's sample receipt.json (run its example on a scratch feed)
//   node tools/skills.mjs --audit [--write]  the auditor's skill check: re-run each skill's tests, check its folder and
//                                            pin; with --write, one signed verdict line per skill in the team's feed
//   node tools/skills.mjs --usable <bot> <skill>   may this bot use this skill now?
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdtempSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { entryFor, problems, refOf, usable, llms } from '../src/skills.mjs';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SKILLS = join(ROOT, 'skills');
const lf = (b) => b.toString('utf8').replace(/\r\n/g, '\n');
export const shaText = (t) => createHash('sha256').update(t).digest('hex');

const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
/** every skill folder as { name, files: [{ path, sha256, text }] } */
export function folders() {
  return readdirSync(SKILLS).filter((n) => statSync(join(SKILLS, n)).isDirectory()).sort().map((name) => {
    const dir = join(SKILLS, name);
    const files = walk(dir).map((p) => { const text = lf(readFileSync(p)); return { path: relative(dir, p).replace(/\\/g, '/'), sha256: shaText(text), text }; }).sort((a, b) => (a.path < b.path ? -1 : 1));
    return { name, files };
  });
}
export const catalogNow = () => ({ kind: 'ai-first-company-skill-catalog', v: 1, skills: folders().map(entryFor) });
const catalogText = (c) => JSON.stringify(c, null, 1) + '\n';

async function feedVerdicts() {
  const { REPO, isSigned } = await import('./team.mjs');
  const { read } = await import('../src/feed.mjs');
  const { verdicts } = await import('../src/auditor.mjs');
  const p = join(REPO, '.estate', 'feed.jsonl');
  return verdicts(read(existsSync(p) ? readFileSync(p, 'utf8') : '', isSigned).lines);
}

const EXAMPLES = {
  'write-feed-line': ['--agent', 'scout', '--kind', 'lead', '--what', 'a firm asked about owning its model; reply to ops@example.com', '--link', 'https://e.example/lead', '--ts', '2026-11-01T09:00:00Z'],
  'check-fence': ['reach', 'post.publish'],
  'audit-feed': [],
  'daily-rollup': ['--date', '2026-11-01'],
};

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/skills.mjs');
if (isMain) {
  const cmd = process.argv[2];
  if (!cmd) {
    const c = catalogNow();
    writeFileSync(join(SKILLS, 'catalog.json'), catalogText(c)); writeFileSync(join(SKILLS, 'llms.txt'), llms(c));
    console.log(`✓ catalog.json and llms.txt written: ${c.skills.length} skills; problems: ${problems(c).length}`);
  } else if (cmd === '--check') {
    const c = catalogNow(), probs = problems(c);
    const same = lf(readFileSync(join(SKILLS, 'catalog.json'))) === catalogText(c) && lf(readFileSync(join(SKILLS, 'llms.txt'))) === llms(c);
    console.log(same && !probs.length ? `✓ the index is the folders' own: ${c.skills.length} skills, every pin current` : '✗ ' + (same ? '' : 'catalog.json or llms.txt is stale (run node tools/skills.mjs); ') + probs.join('; '));
    process.exit(same && !probs.length ? 0 : 1);
  } else if (cmd === '--receipts') {
    for (const [name, args] of Object.entries(EXAMPLES)) {
      const d = mkdtempSync(join(tmpdir(), 'skill-')); mkdirSync(join(d, '.estate')); writeFileSync(join(d, '.estate', 'feed.jsonl'), '');
      const env = { ...process.env, KAR_CONTINUITY: d };
      if (name === 'audit-feed') spawnSync('node', ['tools/team.mjs', 'add', '--agent', 'scout', '--kind', 'note', '--what', 'messaged a lead', '--evidence', 'tool:dm.send', '--ts', '2026-11-01T09:00:00Z'], { cwd: ROOT, env });
      if (name === 'daily-rollup') spawnSync('node', ['tools/team.mjs', 'add', '--agent', 'money-time', '--kind', 'listing', '--what', 'kar-tally listing draft', '--link', 'https://e.example/d', '--ts', '2026-11-01T08:00:00Z'], { cwd: ROOT, env });
      const r = spawnSync('node', [`skills/${name}/scripts/${name}.mjs`, ...args], { cwd: ROOT, encoding: 'utf8', env });
      const ran = ['node', `skills/${name}/scripts/${name}.mjs`, ...args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a))].join(' ');
      writeFileSync(join(SKILLS, name, 'receipt.json'), JSON.stringify({ skill: name, ran, on: 'a scratch feed', exit: r.status, printed: r.stdout.replace(/\r\n/g, '\n').trimEnd().split('\n') }, null, 1) + '\n');
      console.log(`✓ ${name}: exit ${r.status}`);
    }
  } else if (cmd === '--audit') {
    const { add } = await import('./team.mjs');
    const committed = JSON.parse(lf(readFileSync(join(SKILLS, 'catalog.json'))));
    const head = (spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout || '').trim();
    const results = [];
    for (const f of folders()) {
      const e = entryFor(f), pin = (committed.skills.find((x) => x.name === e.name) || {}).sha256;
      const probs = problems({ skills: [e] });
      const t = spawnSync('node', ['--test', `skills/${e.name}/tests/${e.name}.test.mjs`], { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
      const passCount = (/ℹ pass (\d+)/.exec(t.stdout) || [, '0'])[1];
      let receiptOk = false; try { const r = JSON.parse(f.files.find((x) => x.path === 'receipt.json').text); receiptOk = r.skill === e.name && r.exit !== undefined; } catch { receiptOk = false; }
      const ok = probs.length === 0 && t.status === 0 && receiptOk && pin === e.sha256;
      const verdict = ok ? 'PASS' : 'FAIL';
      const why = ok ? `its tests re-run and pass (${passCount}), its folder is whole, its pin is current` : [probs.join('; '), t.status === 0 ? '' : 'its tests fail', receiptOk ? '' : 'no sample receipt', pin === e.sha256 ? '' : 'its pin is stale'].filter(Boolean).join('; ');
      results.push({ skill: e.name, sha256: e.sha256, verdict, why, tests: passCount });
      console.log(`${verdict} ${e.name} v${e.version} @ ${e.sha256.slice(0, 12)}: ${why}`);
      if (process.argv.includes('--write')) {
        const w = add({ agent: 'auditor', kind: 'receipt', verdict, ref: refOf(e.name, e.sha256), what: `${verdict} on skill ${e.name} v${e.version} at ${e.sha256.slice(0, 12)}: ${why}`, link: `https://github.com/sjgant80-hub/ai-first-company/tree/${head}/skills/${e.name}`, evidence: [`tests ${t.status === 0 ? 'ok' : 'FAIL'}: node --test skills/${e.name}/tests/${e.name}.test.mjs (${passCount} pass)`, `folder ${probs.length ? 'FAIL: ' + probs.join('; ') : 'ok: SKILL.md, scripts, tests, receipt.json'}`, `pin ${pin === e.sha256 ? 'ok' : 'FAIL'}: ${e.sha256}`] });
        console.log(w.ok ? `   → written${w.signed ? ', signed' : ' UNSIGNED'}` : '   ✗ ' + w.why);
      }
    }
    process.exitCode = results.every((r) => r.verdict === 'PASS') ? 0 : 1;
  } else if (cmd === '--usable') {
    const [bot, name] = process.argv.slice(3);
    const f = folders().find((x) => x.name === name), e = f ? entryFor(f) : null;
    const committed = JSON.parse(lf(readFileSync(join(SKILLS, 'catalog.json'))));
    const pinned = committed.skills.find((x) => x.name === name);
    const r = usable(pinned, e ? e.sha256 : '', bot, await feedVerdicts());
    console.log(JSON.stringify({ bot, skill: name, ...r })); process.exit(r.ok ? 0 : 1);
  } else { console.error('skills — (no flag) | --check | --receipts | --audit [--write] | --usable <bot> <skill>'); process.exit(2); }
}
