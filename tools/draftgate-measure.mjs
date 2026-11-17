#!/usr/bin/env node
// draftgate-measure.mjs: run the sealed drafts (data/draftgate-prereg.json) through skills/check-draft, once, and write
// data/draftgate-run.json. The public run uses data/draftgate-holds.fixture.json; --private runs the shared repo's real
// holds and prints only verdicts (the private list stays in the shared repo and nothing is written here).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const P = JSON.parse(readFileSync(new URL('../data/draftgate-prereg.json', import.meta.url), 'utf8'));
const SKILL = fileURLToPath(new URL('../skills/check-draft/scripts/check-draft.mjs', import.meta.url));
const priv = process.argv.includes('--private');
const holdsArg = priv ? [] : ['--holds', fileURLToPath(new URL('../data/draftgate-holds.fixture.json', import.meta.url))];
const run = (d) => {
  const r = spawnSync(process.execPath, [SKILL, '--text', d.text, ...(d.link ? ['--link', d.link] : []), ...holdsArg], { encoding: 'utf8' });
  try { return JSON.parse(r.stdout); } catch { return { verdict: 'ERROR', checks: [{ check: 'run', result: 'FAIL', evidence: String(r.stderr).slice(-300) }] }; }
};
const BY = { B1: 'backing', B2: 'hold', B3: 'hold', B4: 'licence', B5: 'backing', B6: 'words' };
const rows = [];
for (const d of [...P.drafts.bad, ...P.drafts.good]) {
  const r = run(d), bad = d.id.startsWith('B');
  const ok = d.mustBe === 'PASS' ? r.verdict === 'PASS' : d.mustBe === 'FAIL' ? r.verdict === 'FAIL' : r.verdict !== 'PASS' && r.verdict !== 'ERROR';
  const byCheck = bad ? r.checks.some((c) => c.check === BY[d.id] && c.result !== 'ok') : null;
  rows.push({ id: d.id, verdict: r.verdict, mustBe: d.mustBe, asSealed: ok, byNamedCheck: byCheck, findings: r.checks.filter((c) => c.result !== 'ok').map((c) => c.check + ' ' + c.result + ': ' + c.evidence) });
  console.log(d.id.padEnd(3), r.verdict.padEnd(5), ok ? 'as sealed' : 'NOT as sealed', bad ? (byCheck ? '· by ' + BY[d.id] : '· NOT by ' + BY[d.id]) : '');
}
if (rows.some((x) => x.verdict === 'ERROR')) { console.error('✗ the harness failed on a draft (ERROR): not a run of the method, nothing written'); process.exit(2); }
const held = rows.filter((x) => x.id.startsWith('B') && x.asSealed && x.byNamedCheck).length, goodPass = rows.filter((x) => x.id.startsWith('G') && x.verdict === 'PASS').length;
const out = { kind: 'ai-first-company-draftgate-run', v: 1, ran: new Date().toISOString().slice(0, 10), holds: priv ? 'private (team/holds.json)' : 'data/draftgate-holds.fixture.json', rows, claims: { D1: { pass: held === 6, held: held + ' of 6' }, D2: { pass: goodPass >= 2, good: goodPass + ' of 3' } } };
if (!priv) writeFileSync(new URL('../data/draftgate-run.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify(out.claims));
