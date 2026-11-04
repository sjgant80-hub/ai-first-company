// site.test.mjs — the structure a stranger and a buyer rely on: every kernel is mutation-gated in CI by the pinned
// witness release, no kernel or vendored module reaches the network, the disk or the environment, everything the page
// loads exists in the repo, every in-page link lands, and the page and README carry what they must.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { gatedKernels, resultsOf } from '../tools/kernel-witness.mjs';

const at = (p) => new URL('../' + p, import.meta.url);
const read = (p) => readFileSync(at(p), 'utf8');
const YML = read('.github/workflows/gate.yml');
const PAGE = read('index.html');
const KERNELS = readdirSync(at('src')).filter((f) => f.endsWith('.mjs')).map((f) => f.slice(0, -4)).sort();

test('every kernel in src/ has its own test file and is witnessed in CI', () => {
  const gated = gatedKernels(YML);
  assert.deepEqual([...gated].sort(), KERNELS);
  assert.equal(new Set(gated).size, gated.length);
  for (const k of KERNELS) assert.equal(existsSync(at(`test/${k}.test.mjs`)), true, k);
});

// a GitHub Actions log as `gh run view --log` prints it, with the interleaving seen on run 41892773758: the next
// kernel's header and this kernel's summary line land inside this kernel's JSON
const J = 'mutation gate (witness v0.6, pinned)\twitness the kernels\t2026-11-04T19:01:12.4969594Z ';
const block = (n, k) => ['{', `  "total": ${n},`, '  "capped": false,', `  "killed": ${k},`, '  "survived": [', '    { "line": 3 }', '  ],', '  "ignored": [],', '  "score": 1,', `  "clean": ${n === k}`, '}'];
const logOf = (lines) => lines.map((l) => J + l).join('\r\n');
test('resultsOf pairs each kernel with its own result, by order, through interleaved lines', () => {
  const clean = (n) => ['{', `  "total": ${n},`, '  "capped": false,', `  "killed": ${n},`, '  "survived": [],', '  "ignored": [],', '  "clean": true', '}'];
  const lines = ['mutation gate: src/journal.mjs · tests: node --test test/journal.test.mjs …', '', '✓ 18/18 killed — no test-theatre.', '{',
    'mutation gate: src/funnel.mjs · tests: node --test test/funnel.test.mjs …', ...clean(18).slice(1), ...clean(35).slice(0, 4), '', '✓ 35/35 killed — no test-theatre.', ...clean(35).slice(4)];
  const other = 'unit suites\tseals\t2026-11-04T19:00:00.0000000Z {';
  assert.deepEqual(resultsOf(other + '\n' + logOf(lines)), {
    journal: { total: 18, killed: 18, survived: 0, ignored: 0, capped: false, clean: true },
    funnel: { total: 35, killed: 35, survived: 0, ignored: 0, capped: false, clean: true },
  });
  // a survivor is carried through as not clean (the receipt check then refuses it)
  const dirty = resultsOf(logOf(['mutation gate: src/x.mjs · tests', ...block(5, 4)]));
  assert.deepEqual(dirty, { x: { total: 5, killed: 4, survived: 1, ignored: 0, capped: false, clean: false } });
  // a kernel with no result, or a summary that disagrees with its result, is an error, never a guess
  assert.throws(() => resultsOf(logOf(['mutation gate: src/x.mjs · tests', 'mutation gate: src/y.mjs · tests', ...clean(3)])), /2 kernels started but 1 results/);
  assert.throws(() => resultsOf(logOf(['mutation gate: src/x.mjs · tests', '✓ 4/4 killed', ...clean(3)])), /disagree/);
  assert.throws(() => resultsOf(logOf(['mutation gate: src/x.mjs · tests', ...clean(3)])), /1 clean results but 0 summary lines/);
});

test('the receipt the page reads is whole: every gated kernel, clean, pinned to the source and test that were gated', () => {
  const r = JSON.parse(read('data/kernel-witness.json'));
  assert.deepEqual(Object.keys(r.kernels).sort(), KERNELS);
  assert.match(r.runUrl, /^https:\/\/github\.com\/sjgant80-hub\/ai-first-company\/actions\/runs\/\d+$/);
  for (const [k, e] of Object.entries(r.kernels)) {
    assert.equal(e.clean && e.survived === 0 && e.ignored === 0 && e.capped === false && e.killed === e.total && e.total > 0, true, k);
    assert.match(e.src, /^[0-9a-f]{64}$/); assert.match(e.test, /^[0-9a-f]{64}$/);
  }
});

test('the witness gate CI runs is the pinned v0.6 release, and only that', () => {
  const clones = [...YML.matchAll(/git clone [^\n]*witness\.git[^\n]*/g)].map((m) => m[0]);
  assert.equal(clones.length, 1);
  assert.match(clones[0], /--branch v0\.6 /);
  assert.equal(/\.\.\/witness\/witness\.mjs/.test(YML), false);
  assert.equal(/--baseline/.test(YML), false);
});

test('no kernel and no vendored module reaches the network, the disk, a child process or the environment', () => {
  const files = [...KERNELS.map((k) => `src/${k}.mjs`)];
  const walk = (d) => { for (const e of readdirSync(at(d), { withFileTypes: true })) { const p = `${d}/${e.name}`; if (e.isDirectory()) walk(p); else if (p.endsWith('.mjs')) files.push(p); } };
  walk('vendor');
  assert.equal(files.length > KERNELS.length, true);
  for (const f of files) {
    const s = read(f);
    for (const bad of ['fetch(', 'node:fs', 'node:child_process', 'node:net', 'node:http', 'XMLHttpRequest', 'WebSocket', 'process.env', 'require(']) assert.equal(s.includes(bad), false, `${f}: ${bad}`);
  }
});

test('nothing is installed from a package registry: every import is Node’s own or a file in the repo', () => {
  assert.equal(existsSync(at('package.json')), false);
  const files = [];
  const walk = (d) => { for (const e of readdirSync(at(d), { withFileTypes: true })) { const p = `${d}/${e.name}`; if (e.isDirectory()) walk(p); else if (p.endsWith('.mjs')) files.push(p); } };
  for (const d of ['src', 'tools', 'test', 'skills', 'vendor']) walk(d);
  let n = 0;
  for (const f of files) for (const m of read(f).matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)) { n++; assert.match(m[1], /^(\.\.?\/|node:)/, `${f}: ${m[1]}`); }
  assert.equal(n > 50, true);
});

test('everything the page loads from this repo exists', () => {
  const paths = new Set();
  for (const m of PAGE.matchAll(/['"]\.?\/?((?:data|src|tools|vendor)\/[\w./-]+\.(?:json|mjs|data|txt))['"]/g)) paths.add(m[1]);
  assert.equal(paths.size > 20, true);
  for (const p of paths) assert.equal(existsSync(at(p)), true, p);
  for (const m of PAGE.matchAll(/blob\/main\/([\w./-]+)"/g)) if (!m[1].includes('$')) assert.equal(existsSync(at(m[1])), true, m[1]);
});

test('every in-page link lands on an element of the page', () => {
  const ids = new Set([...PAGE.matchAll(/\sid="([\w-]+)"/g)].map((m) => m[1]));
  const anchors = [...PAGE.matchAll(/href="#([\w-]+)"/g)].map((m) => m[1]);
  assert.equal(anchors.length > 10, true);
  for (const a of anchors) assert.equal(ids.has(a), true, '#' + a);
});

test('the page explains itself, sells straight, and carries the credits', () => {
  for (const id of ['start', 'dashboard', 'try', 'team', 'growth', 'guarantee', 'how', 'blueprint', 'receipts', 'business', 'case', 'costcase', 'seats', 'years', 'paper']) assert.match(PAGE, new RegExp(`<(section|div) [^>]*id="${id}"`), id);
  assert.match(PAGE, /Powered by the Konomi architecture, created by Thomas Frumkin\./);
  assert.match(PAGE, /AI Native Solutions/);
  assert.match(PAGE, /https:\/\/www\.ai-nativesolutions\.com/);
  // never our prices on a public page: no price, tier or per-seat offer of ours, no token-sale or earnings talk (the one
  // mention of crypto says the auditor refuses it; the auditor's example drafts live in the script and are excluded)
  const prose = PAGE.replace(/<script[\s\S]*<\/script>/, '');
  for (const bad of [/per seat/i, /\bpricing\b/i, /\btiers?\b/i, /presale/i, /airdrop/i, /\btoken sale\b/i, /passive income/i, /\bROI of \d/i]) assert.equal(bad.test(prose), false, String(bad));
  assert.deepEqual([...prose.matchAll(/crypto/gi)].length, 1);
});

test('the page loads nothing from another site and keeps nothing in the browser', () => {
  assert.equal(/<script[^>]+src=/i.test(PAGE), false);
  assert.equal(/<link[^>]+href=/i.test(PAGE), false);
  assert.equal(/@import/i.test(PAGE), false);
  for (const bad of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'sendBeacon']) assert.equal(PAGE.includes(bad), false, bad);
  // every fetch and module import the page makes is a path in this repo (relative), never another origin
  for (const m of PAGE.matchAll(/(?:fetch|import)\(\s*([^)\s,]+)/g)) assert.doesNotMatch(m[1], /^['"`]?(https?:)?\/\//, m[1]);
});

test('the README opens with the live page', () => {
  const top = read('README.md').split('\n').slice(0, 4).join('\n');
  assert.match(top, /https:\/\/sjgant80-hub\.github\.io\/ai-first-company\//);
  assert.match(read('README.md'), /Powered by the Konomi architecture, created by Thomas Frumkin\./);
});
