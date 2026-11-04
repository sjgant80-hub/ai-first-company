// kernel-witness.mjs — the mutation gate's counts for every kernel, read from a CI run's own log (GitHub's runner,
// witness pinned v0.6), never typed in. The page's blueprint shows these counts and checks, in the reader's browser,
// whether the code it is serving still hashes to the code that was gated.
//
//   node tools/kernel-witness.mjs --from-log <run.log> --run <run id> --sha <commit>   write data/kernel-witness.json
//        (the log is `gh run view <id> --log`; the commit is the one that run gated)
//   node tools/kernel-witness.mjs --check
//        the receipt is whole: every kernel CI witnesses is in it, each clean with 0 survived and nothing baselined,
//        each pinned by the SHA-256 of its source and its test at the gated commit. A kernel changed since is named
//        (the CI witness job re-gates it on every push; the receipt is re-read from the next run's log).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const ROOT = new URL('../', import.meta.url);
const OUT = new URL('data/kernel-witness.json', ROOT);
const sha256 = (text) => createHash('sha256').update(String(text).replace(/\r\n/g, '\n'), 'utf8').digest('hex');
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };

// the kernels the CI witness job gates, read from the workflow itself (every `for k in ...; do gate6 $k` list)
export function gatedKernels(yml) {
  const out = [];
  for (const m of String(yml).matchAll(/for k in ([a-z0-9 -]+); do gate6 \$k; done/g)) out.push(...m[1].trim().split(/\s+/));
  return out;
}

// one witness result per kernel from a GitHub Actions log (`gh run view <id> --log`: job, step, timestamp, text).
// Only the witness job's lines are read. Witness writes its header ("mutation gate: src/<k>.mjs") and its one-line
// summary ("✓ n/n killed") to stderr at once, and its JSON result to stdout through `tee`, so the next kernel's header
// can land inside this kernel's JSON. The kernels run one after another, so the k-th JSON block is the k-th header's:
// headers and blocks are paired by order, never by position, and each clean block must match its own summary line.
export function resultsOf(log) {
  const rows = String(log).split('\n').map((l) => l.replace(/\r$/, ''))
    .filter((l) => /^mutation gate\b[^\t]*\t/.test(l))
    .map((l) => l.replace(/^[^\t]*\t[^\t]*\t\S+ ?/, ''));
  const heads = [], blocks = [], ticks = [];
  let buf = null;
  for (const l of rows) {
    const head = l.match(/^mutation gate: src\/([a-z0-9-]+)\.mjs/);
    if (head) { heads.push(head[1]); continue; }
    const tick = l.match(/^✓ (\d+)\/(\d+) killed/);
    if (tick) { ticks.push([Number(tick[1]), Number(tick[2])]); continue; }
    if (!buf) { if (l === '{') buf = ['{']; continue; }
    if (!/^(\s|\}|\])/.test(l)) continue;             // a stderr line or a blank inside the stdout JSON
    buf.push(l);
    if (l === '}') { blocks.push(JSON.parse(buf.join('\n'))); buf = null; }
  }
  if (heads.length !== blocks.length) throw new Error(`${heads.length} kernels started but ${blocks.length} results in the log`);
  const out = {};
  heads.forEach((k, i) => {
    const j = blocks[i];
    out[k] = { total: j.total, killed: j.killed, survived: j.survived.length, ignored: j.ignored.length, capped: j.capped, clean: j.clean };
  });
  if (blocks.every((j) => j.clean === true)) {
    if (ticks.length !== blocks.length) throw new Error(`${blocks.length} clean results but ${ticks.length} summary lines`);
    heads.forEach((k, i) => { if (ticks[i][0] !== out[k].killed || ticks[i][1] !== out[k].total) throw new Error(`src/${k}.mjs: its result and its summary line disagree`); });
  }
  return out;
}

const yml = () => readFileSync(new URL('.github/workflows/gate.yml', ROOT), 'utf8');
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' });

if (process.argv.includes('--from-log')) {
  const log = readFileSync(arg('--from-log'), 'utf8'), run = arg('--run'), sha = arg('--sha');
  if (!/^\d+$/.test(run || '') || !/^[0-9a-f]{7,40}$/.test(sha || '')) { console.error('usage: --from-log <file> --run <id> --sha <commit>'); process.exit(2); }
  const found = resultsOf(log), kernels = {};
  for (const k of gatedKernels(yml())) {
    if (!found[k]) { console.error(`✗ no witness result for src/${k}.mjs in that log`); process.exit(1); }
    kernels[k] = { ...found[k], src: sha256(git('show', `${sha}:src/${k}.mjs`)), test: sha256(git('show', `${sha}:test/${k}.test.mjs`)) };
  }
  const receipt = { kind: 'ai-first-company-kernel-witness', witness: 'v0.6, pinned (git clone --branch v0.6), --cap 1000, nothing baselined', ranOn: 'GitHub Actions (ubuntu-latest), the gate workflow', run: Number(run), runUrl: `https://github.com/sjgant80-hub/ai-first-company/actions/runs/${run}`, at: git('rev-parse', '--short=7', sha).trim(), kernels };
  writeFileSync(OUT, JSON.stringify(receipt, null, 1) + '\n');
  console.log(`✓ ${Object.keys(kernels).length} kernels from run ${run} at ${receipt.at}`);
} else if (process.argv.includes('--check')) {
  if (!existsSync(OUT)) { console.log('no kernel witness receipt yet'); process.exit(0); }
  const r = JSON.parse(readFileSync(OUT, 'utf8'));
  let bad = 0;
  for (const k of gatedKernels(yml())) {
    const e = r.kernels[k];
    if (!e) { console.error(`✗ src/${k}.mjs is gated in CI but missing from the receipt`); bad++; continue; }
    if (e.clean !== true || e.survived !== 0 || e.ignored !== 0 || e.capped !== false || e.killed !== e.total || !(e.total > 0)) { console.error(`✗ src/${k}.mjs: not clean in the receipt`); bad++; }
    const now = sha256(readFileSync(new URL(`src/${k}.mjs`, ROOT), 'utf8')), nowT = sha256(readFileSync(new URL(`test/${k}.test.mjs`, ROOT), 'utf8'));
    if (now !== e.src || nowT !== e.test) console.log(`· src/${k}.mjs changed since ${r.at}: CI re-gates it on this push; re-read the receipt from this run's log`);
  }
  if (bad) process.exit(1);
  console.log(`✓ kernel witness receipt whole: ${Object.keys(r.kernels).length} kernels, all clean, from run ${r.run} at ${r.at}`);
}
