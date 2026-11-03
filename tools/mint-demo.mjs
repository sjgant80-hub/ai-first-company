// mint-demo.mjs — the mint-a-department teacher-distillation demo (sealed: data/mint-demo-prereg.json, 364f29a).
// A local teacher (qwen2.5:7b) proposes decision rules ONCE; gated search keeps only the rules that beat the baseline
// on a GATE split; the grown deterministic rule-set is scored on a FINAL held-out it never saw during selection; the
// result is signed by src/baseline.mjs. The teacher step is non-deterministic, so --run records its raw reply and
// --verify re-derives the gated search, the score and the receipt from that recorded reply (no model call) — the
// deterministic part is re-runnable.
//   node tools/mint-demo.mjs --check     the seal is unchanged since 364f29a and the dataset matches its pinned sha
//   node tools/mint-demo.mjs --run        call the teacher once, measure, sign → data/mint-demo-run.json
//   node tools/mint-demo.mjs --verify     re-derive from the recorded reply; must equal the committed receipt
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { agreement, outcome } from '../src/baseline.mjs';

const SEAL = '364f29a';
const root = new URL('../', import.meta.url);
const file = (p) => new URL(p, root);
const PREREG = 'data/mint-demo-prereg.json', RUN = 'data/mint-demo-run.json', DATA = 'data/mint-demo-car.data';
const DATA_SHA = 'b703a9ac69f11e64ce8c223c0a40de4d2e9d769f7fb20be5f8f2e8a619893d83';
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });
const lf = (t) => t.replace(/\r\n/g, '\n');
const sha = (t) => createHash('sha256').update(t).digest('hex');

const COLS = ['buying', 'maint', 'doors', 'persons', 'lug_boot', 'safety'];
const VALUES = { buying: ['vhigh', 'high', 'med', 'low'], maint: ['vhigh', 'high', 'med', 'low'], doors: ['2', '3', '4', '5more'], persons: ['2', '4', 'more'], lug_boot: ['small', 'med', 'big'], safety: ['low', 'med', 'high'] };
const CLASSES = ['unacc', 'acc', 'good', 'vgood'];

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function loadRows() {
  const raw = lf(readFileSync(file(DATA), 'utf8'));
  if (sha(readFileSync(file(DATA))) !== DATA_SHA) throw new Error('dataset sha mismatch — not the pinned data');
  return raw.trim().split('\n').map((l) => { const c = l.split(','); const row = { class: c[6] }; COLS.forEach((k, i) => row[k] = c[i]); return row; });
}
function split(rows) {
  const r = rng(20261103), a = rows.map((x, i) => ({ x, k: r() })).sort((p, q) => p.k - q.k).map((o) => o.x);
  const n = a.length, t = Math.floor(n * 0.5), g = Math.floor(n * 0.75);
  return { train: a.slice(0, t), gate: a.slice(t, g), final: a.slice(g) };
}
const majorityOf = (rows) => { const c = {}; for (const x of rows) c[x.class] = (c[x.class] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]; };

async function askTeacher(train) {
  const r = rng(7), sample = train.map((x) => ({ x, k: r() })).sort((a, b) => a.k - b.k).slice(0, 40).map((o) => o.x);
  const rows = sample.map((x) => COLS.map((c) => x[c]).join(',') + ' => ' + x.class).join('\n');
  const prompt = `You are distilling decision rules for UCI Car Evaluation. Each car has six features and a class.\n`
    + `Features and their allowed values:\n` + COLS.map((c) => `  ${c}: ${VALUES[c].join(', ')}`).join('\n')
    + `\nClasses: ${CLASSES.join(', ')}.\nHere are 40 labelled examples (feature values comma-separated, then the class):\n${rows}\n\n`
    + `Give the decision rules you would use. Answer with ONLY rules, one per line, each EXACTLY in the form:\nFEATURE == VALUE => CLASS\n`
    + `Use only the feature names, values and classes listed above. No prose, no numbering, no extra text.`;
  const res = await fetch('http://localhost:11434/api/generate', { method: 'POST', body: JSON.stringify({ model: 'qwen2.5:7b', prompt, stream: false, options: { temperature: 0.2, seed: 7, num_predict: 900 } }) });
  const j = await res.json();
  return { prompt, reply: String(j.response || '') };
}
function parseRules(reply) {
  const out = [];
  for (const line of reply.split('\n')) {
    const m = /^\s*([a-z_]+)\s*==\s*([a-z0-9]+)\s*=>\s*([a-z]+)\s*$/i.exec(line.trim());
    if (!m) continue;
    const [f, v, c] = [m[1].toLowerCase(), m[2].toLowerCase(), m[3].toLowerCase()];
    if (COLS.includes(f) && VALUES[f].includes(v) && CLASSES.includes(c) && !out.some((r) => r.f === f && r.v === v && r.c === c)) out.push({ f, v, c });
  }
  return out;
}
function gateRules(rules, gate) {
  return rules.map((r) => { let fires = 0, right = 0; for (const x of gate) if (x[r.f] === r.v) { fires++; if (x.class === r.c) right++; } return { ...r, fires, precision: fires ? right / fires : 0 }; })
    .filter((r) => r.fires >= 15 && r.precision >= 0.80).sort((a, b) => b.precision - a.precision || b.fires - a.fires);
}
function classify(kept, majority, row) { for (const r of kept) if (row[r.f] === r.v) return r.c; return majority; }
const accuracy = (rows, predict) => { let ok = 0; for (const x of rows) if (predict(x) === x.class) ok++; return { n: rows.length, correct: ok, acc: rows.length ? ok / rows.length : 0 }; };

function measureFrom(reply) {
  const rows = loadRows(), { train, gate, final } = split(rows);
  const majority = majorityOf(train);
  const rules = parseRules(reply);
  const kept = gateRules(rules, gate);
  const grown = accuracy(final, (x) => classify(kept, majority, x));
  const base = accuracy(final, () => majority);
  const intake = { job: 'car acceptability', data: 'UCI Car Evaluation (public)', currentTool: 'guess the majority class', client: 'public-demo', supplier: 'AI-Native Solutions', metric: 'accuracy', kind: 'rate', baseline: Math.round(base.acc * 1000) / 1000, direction: 'higher' };
  const design = { minImprovement: 0.08, minSample: final.length, zCrit: 1.96, alpha: 0.05, price: null };
  const agr = agreement(intake, design).agreement;
  const delivery = { testId: agr.test.id, control: { n: base.n, hits: base.correct }, variant: { n: grown.n, hits: grown.correct } };
  const o = outcome(agr, delivery);
  const improvement = Math.round((grown.acc - base.acc) * 1e6) / 1e6;
  const D1 = { pass: improvement >= 0.08 && o.charge === 'due', measured: `grown accuracy ${(grown.acc * 100).toFixed(1)}% vs baseline ${(base.acc * 100).toFixed(1)}% on ${final.length} held-out rows = +${(improvement * 100).toFixed(1)} pts; charge ${o.charge}` };
  const D2 = { pass: kept.length >= 1, measured: `${rules.length} teacher rules parsed, ${kept.length} survived the gate (precision>=0.80, fires>=15 on the gate split); the final split scored once` };
  return { kept, rules, majority, base, grown, improvement, receipt: o.receipt, charge: o.charge, decision: o.decision, D1, D2,
    splitSizes: { train: train.length, gate: gate.length, final: final.length } };
}

function record(m, teacher) {
  return { kind: 'ai-first-company-mint-demo-run', seal: SEAL, dataset: { file: DATA, sha256: DATA_SHA }, teacher: { model: 'qwen2.5:7b', temperature: 0.2, seed: 7 },
    splitSizes: m.splitSizes, trainMajority: m.majority, baselineAccuracy: Math.round(m.base.acc * 1e6) / 1e6, grownAccuracy: Math.round(m.grown.acc * 1e6) / 1e6, improvement: m.improvement,
    rulesParsed: m.rules.length, rulesKept: m.kept.map((r) => `${r.f}==${r.v}=>${r.c} (p=${r.precision.toFixed(2)},fires=${r.fires})`),
    charge: m.charge, decision: m.decision, receipt: m.receipt,
    claims: { D1: m.D1, D2: m.D2 }, held: [m.D1, m.D2].filter((c) => c.pass).length, of: 2,
    teacherPrompt: teacher ? teacher.prompt : undefined, teacherReply: teacher ? teacher.reply : undefined };
}

const cmd = process.argv[2];
if (cmd === '--check') {
  if (lf(git('show', `${SEAL}:${PREREG}`)).trim() !== lf(readFileSync(file(PREREG), 'utf8')).trim()) { console.error('✗ the demo seal changed since ' + SEAL); process.exit(1); }
  if (sha(readFileSync(file(DATA))) !== DATA_SHA) { console.error('✗ the pinned dataset changed'); process.exit(1); }
  console.error('✓ demo seal + dataset unchanged since ' + SEAL);
} else if (cmd === '--run') {
  const teacher = await askTeacher(split(loadRows()).train);
  const m = measureFrom(teacher.reply);
  const out = record(m, teacher);
  writeFileSync(file(RUN), JSON.stringify(out, null, 1) + '\n');
  console.error(`${out.held}/2 held · baseline ${(m.base.acc * 100).toFixed(1)}% → grown ${(m.grown.acc * 100).toFixed(1)}% (+${(m.improvement * 100).toFixed(1)} pts), charge ${m.charge}`);
  console.error(`  rules kept (${m.kept.length}): ` + out.rulesKept.join(' · '));
  for (const [k, c] of Object.entries(out.claims)) console.error(`  ${k} ${c.pass ? 'HELD' : 'FAILED'} · ${c.measured}`);
} else if (cmd === '--verify') {
  if (!existsSync(file(RUN))) { console.error('✗ no committed run to verify'); process.exit(1); }
  const prev = JSON.parse(readFileSync(file(RUN), 'utf8'));
  const m = measureFrom(prev.teacherReply || '');
  const now = record(m, { prompt: prev.teacherPrompt, reply: prev.teacherReply });
  if (JSON.stringify(now) !== JSON.stringify(prev)) { console.error('✗ the demo does not re-derive to the committed run from its recorded teacher reply'); process.exit(1); }
  console.error(`✓ re-derived from the recorded teacher reply: ${now.held}/2 held, receipt ${String(now.receipt).slice(0, 16)}…, identical to the committed run`);
} else { console.error('mint-demo — --check | --run | --verify'); process.exit(2); }
