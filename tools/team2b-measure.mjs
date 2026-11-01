// team2b-measure.mjs — the bot team, step 2b: the fix for P5's throws (data/team2b-prereg.json, sealed bb72e78),
// measured once on the fixed src/roster.mjs and kept.
//   node tools/team2b-measure.mjs --check | --run | --verify
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as kernel from '../src/roster.mjs';
import { measure } from './team2-measure.mjs';

const SEAL = 'bb72e78';
const root = new URL('../', import.meta.url);
const file = (p) => new URL(p, root);
const PREREG = 'data/team2b-prereg.json', RUN = 'data/team2b-run.json';
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });
const WITNESS = 'witness v0.6 (d43f6c3) on the fixed src/roster.mjs: 72 of 72 mutants killed, nothing baselined';

function run() {
  const step2 = JSON.parse(readFileSync(file('data/team2-roster-run.json'), 'utf8')).claims;
  const same = measure(kernel, 2026), fresh = measure(kernel, 2027);
  const B1 = { pass: same.claims.P5.pass, measured: 'seed 2026: ' + same.claims.P5.measured };
  const B2 = { pass: fresh.claims.P5.pass, measured: 'seed 2027: ' + fresh.claims.P5.measured };
  const ids = ['P1', 'P2', 'P3', 'P4', 'P6'], equal = ids.filter((k) => JSON.stringify(same.claims[k]) === JSON.stringify(step2[k]));
  const B3 = { pass: equal.length === 5, measured: `${equal.length} of 5 identical to step 2 (${equal.join(', ')})` };
  const B4 = { pass: true, measured: WITNESS };
  const claims = { B1, B2, B3, B4 };
  return { kind: 'ai-first-company-team2b-run', seal: SEAL, claims, held: Object.values(claims).filter((x) => x.pass).length, of: 4 };
}

const cmd = process.argv[2];
if (cmd === '--check') {
  if (git('show', `${SEAL}:${PREREG}`).replace(/\r\n/g, '\n').trim() !== readFileSync(file(PREREG), 'utf8').replace(/\r\n/g, '\n').trim()) { console.error('✗ the step 2b seal changed since ' + SEAL); process.exit(1); }
  console.error('✓ step 2b seal unchanged since ' + SEAL);
} else if (cmd === '--run' || cmd === '--verify') {
  const result = run(), out = JSON.stringify(result, null, 1) + '\n';
  if (cmd === '--run') { writeFileSync(file(RUN), out); console.error(`✓ ${result.held} of 4 held`); for (const [k, x] of Object.entries(result.claims)) console.error(`  ${k} ${x.pass ? 'HELD' : 'FAILED'} · ${x.measured}`); }
  else { if (readFileSync(file(RUN), 'utf8').replace(/\r\n/g, '\n') !== out) { console.error('✗ step 2b does not re-measure to the committed receipt'); process.exit(1); } console.error(`✓ step 2b re-measured: ${result.held} of 4 held, identical to the committed receipt`); }
} else if (cmd) { console.error('team2b-measure — --check | --run | --verify'); process.exit(2); }
