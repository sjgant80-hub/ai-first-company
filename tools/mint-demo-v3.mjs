// mint-demo-v3.mjs — the teacher-distillation demo, v3: UCI Mushroom, single-feature (sealed: data/mint-demo-v3-prereg.json, 9ec04b0).
// After two kept car nulls, the same mechanism on a dataset where a single feature (odor) carries the signal. The feature
// schema (allowed values) is derived from the TRAIN split; the teacher learns from labelled examples, not from meanings.
// --run calls the teacher once and keeps its reply; --verify re-derives the gated search, score and receipt from it.
//   node tools/mint-demo-v3.mjs --check | --run | --verify
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { agreement, outcome } from '../src/baseline.mjs';

const SEAL = '9ec04b0';
const root = new URL('../', import.meta.url);
const file = (p) => new URL(p, root);
const PREREG = 'data/mint-demo-v3-prereg.json', RUN = 'data/mint-demo-v3-run.json', DATA = 'data/mint-demo-mushroom.data';
const DATA_SHA = 'e65d082030501a3ebcbcd7c9f7c71aa9d28fdfff463bf4cf4716a3fe13ac360e';
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });
const lf = (t) => t.replace(/\r\n/g, '\n');
const sha = (t) => createHash('sha256').update(t).digest('hex');

const NAMES = ['cap-shape', 'cap-surface', 'cap-color', 'bruises', 'odor', 'gill-attachment', 'gill-spacing', 'gill-size', 'gill-color', 'stalk-shape', 'stalk-root', 'stalk-surface-above-ring', 'stalk-surface-below-ring', 'stalk-color-above-ring', 'stalk-color-below-ring', 'veil-type', 'veil-color', 'ring-number', 'ring-type', 'spore-print-color', 'population', 'habitat'];
const CLASSES = ['e', 'p'];

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function loadRows() {
  if (sha(readFileSync(file(DATA))) !== DATA_SHA) throw new Error('dataset sha mismatch');
  return lf(readFileSync(file(DATA), 'utf8')).trim().split('\n').map((l) => { const c = l.split(','); const row = { class: c[0] }; NAMES.forEach((k, i) => row[k] = c[i + 1]); return row; });
}
function split(rows) {
  const r = rng(20261103), a = rows.map((x) => ({ x, k: r() })).sort((p, q) => p.k - q.k).map((o) => o.x);
  const n = a.length, t = Math.floor(n * 0.5), g = Math.floor(n * 0.75);
  return { train: a.slice(0, t), gate: a.slice(t, g), final: a.slice(g) };
}
const majorityOf = (rows) => { const c = {}; for (const x of rows) c[x.class] = (c[x.class] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]; };
function schemaFrom(train) { const v = {}; for (const f of NAMES) v[f] = [...new Set(train.map((x) => x[f]))].sort(); return v; }

async function askTeacher(train, values) {
  const r = rng(7), sample = train.map((x) => ({ x, k: r() })).sort((a, b) => a.k - b.k).slice(0, 40).map((o) => o.x);
  const rows = sample.map((x) => NAMES.map((c) => x[c]).join(',') + ' => ' + x.class).join('\n');
  const prompt = `You are distilling decision rules for UCI Mushroom (classify a mushroom edible or poisonous).\n`
    + `Classes: e = edible, p = poisonous.\nFeatures and their values (comma-separated, in the order used in the rows):\n`
    + NAMES.map((f) => `  ${f}: ${values[f].join(', ')}`).join('\n')
    + `\n40 labelled examples (the 22 feature values in order, then the class):\n${rows}\n\n`
    + `Find the single features whose value decides the class. Answer with ONLY rules, one per line, each EXACTLY:\nFEATURE == VALUE => CLASS\n`
    + `Use only the feature names and values listed above and classes e or p. No prose, no numbering.`;
  const res = await fetch('http://localhost:11434/api/generate', { method: 'POST', body: JSON.stringify({ model: 'qwen2.5:7b', prompt, stream: false, options: { temperature: 0.2, seed: 7, num_predict: 1000 } }) });
  return { prompt, reply: String((await res.json()).response || '') };
}
function parseRules(reply, values) {
  const out = [];
  for (const line of reply.split('\n')) {
    const m = /^\s*([a-z0-9-]+)\s*==\s*([a-z0-9?]+)\s*=>\s*([ep])\s*$/i.exec(line.trim());
    if (!m) continue;
    const f = m[1].toLowerCase(), v = m[2].toLowerCase(), c = m[3].toLowerCase();
    if (NAMES.includes(f) && values[f] && values[f].includes(v) && !out.some((r) => r.f === f && r.v === v && r.c === c)) out.push({ f, v, c });
  }
  return out;
}
function gateRules(rules, gate) {
  return rules.map((r) => { let f = 0, right = 0; for (const x of gate) if (x[r.f] === r.v) { f++; if (x.class === r.c) right++; } return { ...r, fires: f, precision: f ? right / f : 0 }; })
    .filter((r) => r.fires >= 15 && r.precision >= 0.80).sort((a, b) => b.precision - a.precision || b.fires - a.fires);
}
const classify = (kept, majority, row) => { for (const r of kept) if (row[r.f] === r.v) return r.c; return majority; };
const accuracy = (rows, predict) => { let ok = 0; for (const x of rows) if (predict(x) === x.class) ok++; return { n: rows.length, correct: ok, acc: rows.length ? ok / rows.length : 0 }; };

function measureFrom(reply) {
  const { train, gate, final } = split(loadRows());
  const values = schemaFrom(train), majority = majorityOf(train);
  const rules = parseRules(reply, values), kept = gateRules(rules, gate);
  const grown = accuracy(final, (x) => classify(kept, majority, x)), base = accuracy(final, () => majority);
  const intake = { job: 'mushroom edibility', data: 'UCI Mushroom (public)', currentTool: 'guess the majority class', client: 'public-demo', supplier: 'AI-Native Solutions', metric: 'accuracy', kind: 'rate', baseline: Math.round(base.acc * 1000) / 1000, direction: 'higher' };
  const agr = agreement(intake, { minImprovement: 0.08, minSample: final.length, zCrit: 1.96, alpha: 0.05, price: null }).agreement;
  const o = outcome(agr, { testId: agr.test.id, control: { n: base.n, hits: base.correct }, variant: { n: grown.n, hits: grown.correct } });
  const improvement = Math.round((grown.acc - base.acc) * 1e6) / 1e6;
  return { kept, rules, majority, base, grown, improvement, charge: o.charge, decision: o.decision, receipt: o.receipt, splitSizes: { train: train.length, gate: gate.length, final: final.length },
    M1: { pass: improvement >= 0.08 && o.charge === 'due', measured: `grown ${(grown.acc * 100).toFixed(1)}% vs baseline ${(base.acc * 100).toFixed(1)}% on ${final.length} held-out rows = +${(improvement * 100).toFixed(1)} pts; charge ${o.charge}` },
    M2: { pass: kept.length >= 1, measured: `${rules.length} rules parsed, ${kept.length} survived the gate (precision>=0.80, fires>=15)` } };
}
function record(m, teacher) {
  return { kind: 'ai-first-company-mint-demo-v3-run', seal: SEAL, dataset: { file: DATA, sha256: DATA_SHA }, teacher: { model: 'qwen2.5:7b', temperature: 0.2, seed: 7 },
    splitSizes: m.splitSizes, trainMajority: m.majority, baselineAccuracy: Math.round(m.base.acc * 1e6) / 1e6, grownAccuracy: Math.round(m.grown.acc * 1e6) / 1e6, improvement: m.improvement,
    rulesParsed: m.rules.length, rulesKept: m.kept.map((r) => `${r.f}==${r.v}=>${r.c} (p=${r.precision.toFixed(2)},fires=${r.fires})`),
    charge: m.charge, decision: m.decision, receipt: m.receipt, claims: { M1: m.M1, M2: m.M2 }, held: [m.M1, m.M2].filter((c) => c.pass).length, of: 2,
    teacherPrompt: teacher ? teacher.prompt : undefined, teacherReply: teacher ? teacher.reply : undefined };
}

const cmd = process.argv[2];
if (cmd === '--check') {
  if (lf(git('show', `${SEAL}:${PREREG}`)).trim() !== lf(readFileSync(file(PREREG), 'utf8')).trim()) { console.error('✗ v3 seal changed since ' + SEAL); process.exit(1); }
  console.error('✓ v3 seal + dataset unchanged since ' + SEAL);
} else if (cmd === '--run') {
  const { train } = split(loadRows()); const teacher = await askTeacher(train, schemaFrom(train));
  const m = measureFrom(teacher.reply), out = record(m, teacher);
  writeFileSync(file(RUN), JSON.stringify(out, null, 1) + '\n');
  console.error(`${out.held}/2 held · baseline ${(m.base.acc * 100).toFixed(1)}% → grown ${(m.grown.acc * 100).toFixed(1)}% (+${(m.improvement * 100).toFixed(1)} pts), charge ${m.charge}`);
  console.error(`  rules kept (${m.kept.length}): ` + out.rulesKept.slice(0, 14).join(' · '));
  for (const [k, c] of Object.entries(out.claims)) console.error(`  ${k} ${c.pass ? 'HELD' : 'FAILED'} · ${c.measured}`);
} else if (cmd === '--verify') {
  if (!existsSync(file(RUN))) { console.error('✗ no committed v3 run'); process.exit(1); }
  const prev = JSON.parse(readFileSync(file(RUN), 'utf8')), now = record(measureFrom(prev.teacherReply || ''), { prompt: prev.teacherPrompt, reply: prev.teacherReply });
  if (JSON.stringify(now) !== JSON.stringify(prev)) { console.error('✗ v3 does not re-derive to the committed run'); process.exit(1); }
  console.error(`✓ v3 re-derived: ${now.held}/2 held, receipt ${String(now.receipt).slice(0, 16)}…, identical`);
} else { console.error('mint-demo-v3 — --check | --run | --verify'); process.exit(2); }
