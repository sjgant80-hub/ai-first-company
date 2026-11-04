// site.test.mjs — the structure a stranger and a buyer rely on: every kernel is mutation-gated in CI by the pinned
// witness release, no kernel or vendored module reaches the network, the disk or the environment, everything the page
// loads exists in the repo, every in-page link lands, and the page and README carry what they must.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { gatedKernels } from '../tools/kernel-witness.mjs';

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
  // the one file the page may find absent: the gate's counts, which are read from a CI run's log after that run ends
  // (tools/kernel-witness.mjs); the page says "gated in CI on every push" until it lands
  for (const p of paths) if (p !== 'data/kernel-witness.json') assert.equal(existsSync(at(p)), true, p);
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
