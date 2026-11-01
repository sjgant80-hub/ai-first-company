// team2-measure.mjs — the bot team, step 2 (persona files): the sealed claims (data/team2-roster-prereg.json, sealed
// 04231c8), measured once and kept.
//   node tools/team2-measure.mjs --check     the seal is unchanged
//   node tools/team2-measure.mjs --private   P6's third part, on Kar's machine: the shared repo's cards are the roster's
//   node tools/team2-measure.mjs --run       every claim → data/team2-roster-run.json
//   node tools/team2-measure.mjs --verify    re-measure; must equal the committed receipt
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PERSONAS } from '../src/feed.mjs';
import { stampOf } from '../src/cards.mjs';
import { cardsFor, rosterText, stale, shaOf } from './team-cards.mjs';

const SEAL = '04231c8', CODE = 'b05c7f6';   // step 2 is re-measured with roster.mjs as it was at its own commit
const root = new URL('../', import.meta.url);
const file = (p) => new URL(p, root);
const readJSON = (p) => JSON.parse(readFileSync(file(p), 'utf8'));
const PREREG = 'data/team2-roster-prereg.json', RUN = 'data/team2-roster-run.json', PRIV = 'data/team2-cards-private.json';
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const subsets = (xs) => xs.reduce((acc, x) => acc.concat(acc.map((s) => s.concat([x]))), [[]]);
const ctxOf = (conds) => ({ auditorPass: conds.includes('auditor-pass'), simonGo: conds.includes('simon-go') });
const ALL = { auditorPass: true, simonGo: true };

/** roster.mjs as it was at a commit (its one import pointed at today's feed.mjs, whose persona and kind lists it reads) */
export async function kernelAt(commit) {
  const src = git('show', `${commit}:src/roster.mjs`).replace("from './feed.mjs'", 'from ' + JSON.stringify(new URL('src/feed.mjs', root).href));
  const p = join(mkdtempSync(join(tmpdir(), 'roster-')), 'roster.mjs');
  writeFileSync(p, src);
  return import(pathToFileURL(p).href);
}

export function measure({ problems, may, toolOf }, seed = 2026) {
  const R = readJSON('data/roster.json'), P = readJSON(PREREG);
  const persona = (id) => R.personas.find((p) => p.id === id);
  // P1
  const probs = problems(R), ids = R.personas.map((p) => p.id);
  const whole = R.personas.filter((p) => ['name', 'role', 'runs_on'].every((f) => typeof p[f] === 'string' && p[f]) && p.runtime && p.runtime.model && p.runtime.config && p.tools.length && p.forbidden.length && p.owns.length).length;
  const P1 = { pass: probs.length === 0 && whole === 8 && ids.length === 8 && PERSONAS.every((id) => ids.includes(id)), measured: `${whole} of 8 whole; personas ${JSON.stringify(ids)}; problems ${probs.length}`, problems: probs };
  // P2 — each sealed clause as a machine answer
  const clause = (c) => {
    const p = persona(c.persona);
    if (!p) return { id: c.id, ok: false, why: 'no persona' };
    if (c.content) return { id: c.id, ok: Array.isArray(p.content) && p.content.includes(c.content), why: 'content rule ' + c.content };
    if (c.id === 'S2') { const okTools = p.tools.every((t) => { const n = typeof t === 'string' ? t : t.tool; return R.tools[n].class === 'read' || ['feed.write', 'lead.log', 'gap.log'].includes(n); }); return { id: c.id, ok: okTools, why: 'scout tools read or logging' }; }
    if (c.id === 'A2') { const a = persona('auditor').runtime; const ok = ['builder', 'kar'].every((id) => persona(id).runtime.model !== a.model && persona(id).runtime.config !== a.config); return { id: c.id, ok, why: 'auditor runtime ' + a.model + ' differs' }; }
    const results = c.tools.map((t) => {
      if (c.rule === 'forbidden') { const r = may(R, c.persona, t, ALL); return { t, ok: !r.ok, why: r.why || 'allowed' }; }
      const under = subsets(c.rule).filter((s) => s.length < c.rule.length).every((s) => !may(R, c.persona, t, ctxOf(s)).ok);
      const met = may(R, c.persona, t, ctxOf(c.rule)).ok;
      return { t, ok: under && met, why: `refused without ${c.rule.join(' + ')}: ${under}; allowed with it: ${met}` };
    });
    return { id: c.id, ok: results.every((x) => x.ok), why: results.map((x) => `${x.t} ${x.why}`).join('; ') };
  };
  const clauses = P.clauses.map(clause);
  const P2 = { pass: clauses.length === 21 && clauses.every((c) => c.ok), measured: `${clauses.filter((c) => c.ok).length} of ${clauses.length} clauses hold`, clauses };
  // P3 — the fence
  const outward = Object.keys(R.tools).filter((t) => R.tools[t].class === 'outward');
  let pairs = 0, refused = 0;
  for (const id of PERSONAS) for (const t of outward) { pairs++; if (!may(R, id, t, { auditorPass: true }).ok) refused++; }
  const verdicters = PERSONAS.filter((id) => may(R, id, 'verdict.write', ALL).ok);
  const P3 = { pass: refused === pairs && JSON.stringify(verdicters) === '["auditor"]', measured: `${refused} of ${pairs} persona × outward-tool pairs refused without Simon's go (with the auditor's PASS); verdict.write allowed for ${JSON.stringify(verdicters)}` };
  // P4 — one owner per output; every persona can write the kinds its role needs
  const owners = {};
  for (const p of R.personas) for (const o of p.owns) (owners[o] = owners[o] || []).push(p.id);
  const twice = Object.entries(owners).filter(([, v]) => v.length > 1).map(([o]) => o);
  const ROLE = { kar: [{ kind: 'task', to: 'builder' }, { kind: 'decision', verdict: 'pause' }], builder: [{ kind: 'build' }], 'money-time': [{ kind: 'listing' }], reach: [{ kind: 'post' }], scout: [{ kind: 'lead' }], 'client-lead': [{ kind: 'receipt' }], 'card-keeper': [{ kind: 'receipt' }], auditor: [{ kind: 'receipt', verdict: 'PASS' }, { kind: 'decision', verdict: 'pause' }] };
  const cannot = [];
  for (const id of PERSONAS) for (const line of [{ kind: 'task' }, { kind: 'note' }, { kind: 'blocker' }, ...ROLE[id]]) if (!may(R, id, toolOf(line), {}).ok) cannot.push(`${id}: ${JSON.stringify(line)}`);
  const P4 = { pass: twice.length === 0 && cannot.length === 0, measured: `${Object.keys(owners).length} outputs, ${twice.length} owned twice; ${cannot.length} needed kinds refused`, twice, cannot };
  // P5 — total
  const r = rng(seed), int = (n) => Math.floor(r() * n), pick = (a) => a[int(a.length)];
  const junk = () => pick([null, undefined, 0, 1, true, '', 'x', 'kar', 'post.publish', [], {}, { tools: 5 }, { personas: [null] }, { auditorPass: true }, { kind: 'post' }, { kind: 'decision', verdict: 'approve' }, NaN, 'constructor', '__proto__']);
  const bent = () => { const c = JSON.parse(JSON.stringify(R)); const p = pick(c.personas); const f = pick(['tools', 'forbidden', 'owns', 'runtime', 'id', 'name', 'content']); p[f] = junk(); if (r() < 0.3) c.tools[pick(Object.keys(c.tools))] = junk(); return c; };
  let throws = 0, yesToUnknown = 0, calls = 0;
  for (let i = 0; i < 1000; i++) {
    const roster = i % 2 ? bent() : junk();
    try { calls++; problems(roster); } catch { throws++; }
    try { calls++; toolOf(junk()); } catch { throws++; }
    const who = i % 3 ? pick(PERSONAS) : String(junk()), tool = i % 3 ? pick(Object.keys(R.tools)) : String(junk());
    try { calls++; const out = may(i % 2 ? roster : R, who, tool, junk()); if (out.ok && (!PERSONAS.includes(who) || !Object.hasOwn(R.tools, tool))) yesToUnknown++; } catch { throws++; }
  }
  const P5 = { pass: throws === 0 && yesToUnknown === 0 && calls === 3000, measured: `${calls} fuzzed calls: ${throws} threw; ${yesToUnknown} said yes to an unknown persona or tool` };
  // P6 — the cards are the roster
  const text = rosterText(), sha = shaOf(text), a = cardsFor(text), b = cardsFor(text);
  const same = PERSONAS.filter((id) => a[id] && a[id] === b[id] && stampOf(a[id]) === sha).length;
  const bumped = text.replace('"v": 1', '"v": 2'), c = cardsFor(bumped);
  const staleAfter = PERSONAS.filter((id) => c[id] !== a[id] && stampOf(c[id]) !== sha).length;
  const priv = existsSync(file(PRIV)) ? readJSON(PRIV) : null;
  const P6 = { pass: same === 8 && staleAfter === 8 && bumped !== text && !!priv && priv.equal === 8 && priv.roster === sha, measured: `${same} of 8 regenerate identical, stamped ${sha.slice(0, 12)}; a one-byte roster change makes ${staleAfter} of 8 stale; the shared repo's cards: ${priv ? priv.equal + ' of 8 equal to roster ' + priv.roster.slice(0, 12) + ' (checked on Kar\'s machine ' + priv.at + '; CI cannot see the private repo)' : 'not checked yet'}` };
  const claims = { P1, P2, P3, P4, P5, P6 };
  return { kind: 'ai-first-company-team2-roster-run', seal: SEAL, roster: sha, claims, held: Object.values(claims).filter((x) => x.pass).length, of: 6 };
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/team2-measure.mjs');
const cmd = isMain ? process.argv[2] : undefined;
if (cmd === '--check') {
  if (git('show', `${SEAL}:${PREREG}`).replace(/\r\n/g, '\n').trim() !== readFileSync(file(PREREG), 'utf8').replace(/\r\n/g, '\n').trim()) { console.error('✗ the step 2 seal changed since ' + SEAL); process.exit(1); }
  console.error('✓ step 2 seal unchanged since ' + SEAL);
} else if (cmd === '--private') {
  const s = stale();
  const out = { equal: 8 - s.length, stale: s, roster: shaOf(rosterText()), at: new Date().toISOString().slice(0, 10) };
  writeFileSync(file(PRIV), JSON.stringify(out, null, 1) + '\n');
  console.error(`✓ the shared repo's cards: ${out.equal} of 8 equal to the roster`);
} else if (cmd === '--run' || cmd === '--verify') {
  const result = measure(await kernelAt(CODE));
  const out = JSON.stringify(result, null, 1) + '\n';
  if (cmd === '--run') { writeFileSync(file(RUN), out); console.error(`✓ ${result.held} of 6 held`); for (const [k, x] of Object.entries(result.claims)) console.error(`  ${k} ${x.pass ? 'HELD' : 'FAILED'} · ${x.measured}`); }
  else { if (readFileSync(file(RUN), 'utf8').replace(/\r\n/g, '\n') !== out) { console.error('✗ step 2 does not re-measure to the committed receipt'); process.exit(1); } console.error(`✓ step 2 re-measured: ${result.held} of 6 held, identical to the committed receipt`); }
} else if (cmd) { console.error('team2-measure — --check | --private | --run | --verify'); process.exit(2); }
