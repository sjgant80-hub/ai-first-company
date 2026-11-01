// team1-measure.mjs — the bot team, step 1 (feed + rules): the sealed claims (data/team1-feed-prereg.json, sealed
// 9f75b07), measured once and kept.
//   node tools/team1-measure.mjs --check      the seal and its test sets are unchanged
//   node tools/team1-measure.mjs --heldout    F3b, once: the local 7B writes the held-out lines (data/team1-f3b-heldout.json)
//   node tools/team1-measure.mjs --private    F2b, once, on Kar's machine: the real log, counts only (data/team1-f2b-run.json)
//   node tools/team1-measure.mjs --run        every claim → data/team1-feed-run.json
//   node tools/team1-measure.mjs --verify     re-measure; must equal the committed receipt
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync, sign, verify as edVerify } from 'node:crypto';
import { corpus, realText, shaOf } from './team1-corpus.mjs';
import { PERSONAS, AGENTS, entry, read, append, signingText, redact, mayAct } from '../src/feed.mjs';
import { rollup, insert, dayOf } from '../src/rollup.mjs';

const SEAL = '9f75b07';
const root = new URL('../', import.meta.url);
const file = (p) => new URL(p, root);
const readJSON = (p) => JSON.parse(readFileSync(file(p), 'utf8'));
const PREREG = 'data/team1-feed-prereg.json', RUN = 'data/team1-feed-run.json', HELD = 'data/team1-f3b-heldout.json', PRIV = 'data/team1-f2b-run.json';
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
const atSeal = (p) => git('show', `${SEAL}:${p}`).replace(/\r\n/g, '\n');
const TS = '2026-11-01T22:00:00Z';
const put = (o, lines) => entry({ ts: TS, agent: 'kar', kind: 'note', ...o }, lines);

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ── keys: one fresh Ed25519 pair per identity; the receipt carries counts, never a key or a signature ──
const KEYS = Object.fromEntries(AGENTS.map((a) => [a, generateKeyPairSync('ed25519')]));
const signAs = (line, who) => ({ ...line, sig: sign(null, Buffer.from(signingText(line)), KEYS[who].privateKey).toString('base64') });
const sigOk = (x) => typeof x.sig === 'string' && AGENTS.includes(x.agent) && edVerify(null, Buffer.from(signingText(x)), KEYS[x.agent].publicKey, Buffer.from(x.sig, 'base64'));

function F1F2F3(c) {
  // F1 — no 12-character run of any planted secret survives
  const leaks = [];
  for (const p of c.planted) {
    const r = put({ what: p.what });
    const kept = r.ok ? r.line.what : '';
    let leaked = !r.ok;
    for (let i = 0; !leaked && i + 12 <= p.secret.length; i++) if (kept.includes(p.secret.slice(i, i + 12))) leaked = true;
    if (p.secret.length < 12 && kept.includes(p.secret)) leaked = true;
    if (leaked) leaks.push(p.cls);
  }
  const byClass = Object.fromEntries(['key', 'token', 'email', 'card'].map((k) => [k, c.planted.filter((p) => p.cls === k).length - leaks.filter((x) => x === k).length]));
  const F1 = { pass: leaks.length === 0, measured: `${c.planted.length - leaks.length} of ${c.planted.length} planted secrets gone (keys ${byClass.key}/60, tokens ${byClass.token}/60, emails ${byClass.email}/60, cards ${byClass.card}/60)` };
  // F2 — look-alikes and real public text stored exactly as sent (the writer's only normalisation, trimming the ends, applied to both sides)
  const real = realText((p) => atSeal(p));
  const changed = (t) => { const r = put({ what: t }); return !r.ok || r.line.what !== t.trim(); };
  const genChanged = c.clean.filter((x) => changed(x.what)).length, realChanged = real.filter(changed).length;
  const F2 = { pass: genChanged === 0 && realChanged === 0, measured: `${c.clean.length - genChanged} of ${c.clean.length} look-alikes and ${real.length - realChanged} of ${real.length} real public lines unchanged` };
  // F3 — done with no link flagged, with a link not, non-claims not
  const flagged = (what, link) => { const r = put({ what, ...(link ? { link } : {}) }); return r.ok && r.line.flags.includes('no-receipt'); };
  const a = c.claims.filter((x) => flagged(x.what)).length, b = c.claims.filter((x) => flagged(x.what, 'https://github.com/sjgant80-hub/ai-first-company/actions')).length, n = c.nonclaims.filter((x) => flagged(x.what)).length;
  const F3 = { pass: a === 60 && b === 0 && n === 0, measured: `no link: ${a} of 60 flagged; with a link: ${b} of 60; claiming nothing: ${n} of 30` };
  return { F1, F2, F3 };
}

function F3b() {
  if (!existsSync(file(HELD))) return { pass: false, measured: 'not measured: the held-out lines have not been generated (run --heldout once)' };
  const h = readJSON(HELD);
  const flag = (what) => { const r = put({ what }); return r.ok && r.line.flags.includes('no-receipt'); };
  const f = h.finished.filter(flag).length, u = h.unfinished.filter(flag).length;
  return { pass: h.finished.length === 40 && h.unfinished.length === 40 && f >= 34 && u <= 6, measured: `finished ${f} of ${h.finished.length} flagged; unfinished ${u} of ${h.unfinished.length} flagged (local ${h.model}, generated ${h.generated})`, missed: h.finished.filter((x) => !flag(x)), wrongly: h.unfinished.filter(flag) };
}

function F4() {
  const r = rng(4242);
  const int = (n) => Math.floor(r() * n), pick = (a) => a[int(a.length)];
  const any = (d = 0) => pick([null, undefined, true, false, 0, -1, 1.5, NaN, '', ' ', 'x', 'kar', 'post', 'handoff', TS, '2026-11-01', 'a'.repeat(64), [], {}, d < 2 ? [any(d + 1)] : 7, d < 2 ? { k: any(d + 1) } : 'y']);
  const fields = ['ts', 'agent', 'kind', 'what', 'link', 'needs_owner', 'receipt_sha256', 'to', 'ref', 'verdict', 'quote', 'evidence', 'flags', 'sig', 'extra'];
  const good = () => ({ ts: TS, agent: pick(AGENTS), kind: pick(['task', 'handoff', 'build', 'receipt', 'listing', 'post', 'lead', 'decision', 'blocker', 'note']), what: 'did a thing', link: pick(['', 'https://e.example/r']), needs_owner: pick([true, false]), to: pick(PERSONAS) });
  let throws = 0, unreasoned = 0, accepted = 0, roundTrip = 0;
  for (let i = 0; i < 3000; i++) {
    let x;
    const mode = i % 3;
    if (mode === 0) x = any();
    else if (mode === 1) { x = {}; for (const f of fields) if (r() < 0.5) x[f] = any(); }
    else { x = good(); x[pick(fields)] = any(); }
    try {
      const out = entry(x);
      if (out.ok) { accepted++; const back = read(append('', out.line)).lines[0]; if (back) { const { id, signed, ...rest } = back; if (JSON.stringify(rest) === JSON.stringify(out.line)) roundTrip++; } }
      else if (typeof out.why !== 'string' || !out.why) unreasoned++;
    } catch { throws++; }
  }
  const named = [
    [{ agent: 'grok' }, 'unknown agent'], [{ kind: 'tweet' }, 'unknown kind'], [{ kind: 'handoff', to: 'simon' }, 'a handoff must name the next persona'],
    [{ what: '  ' }, 'empty what'], [{ ts: '1 Nov 2026 22:00' }, 'ts is not an ISO 8601 time'],
  ].filter(([o, why]) => { const out = put({ what: 'x', ...o }); return !out.ok && out.why === why; }).length;
  return { pass: throws === 0 && unreasoned === 0 && roundTrip === accepted && named === 5, measured: `3000 fuzzed: ${throws} threw, ${3000 - accepted} refused (${unreasoned} without a reason), ${accepted} accepted, ${roundTrip} of them read back identical; named refusals ${named} of 5` };
}

function F5() {
  let verified = 0, total = 0, mutated = 0, mutatedFailed = 0, cross = 0, crossFailed = 0;
  const bump = (v) => (typeof v === 'string' ? v + 'x' : typeof v === 'boolean' ? !v : Array.isArray(v) ? v.concat(['x']) : v);
  for (const a of AGENTS) for (let i = 0; i < 20; i++) {
    const out = put({ agent: a, kind: i % 2 ? 'task' : 'note', what: `line ${i} by ${a}`, link: i % 3 ? 'https://e.example/' + i : '', receipt_sha256: i % 4 ? undefined : 'b'.repeat(64) });
    const s = signAs(out.line, a);
    total++; if (sigOk(s)) verified++;
    for (const k of Object.keys(s)) { if (k === 'sig') continue; const m = { ...s, [k]: bump(s[k]) }; mutated++; if (!sigOk(m)) mutatedFailed++; }
  }
  for (const a of AGENTS) for (const b of AGENTS) {
    if (a === b) continue;
    const s = signAs(put({ agent: a, what: `${a} says it` }).line, b);
    cross++; if (!sigOk(s)) crossFailed++;
  }
  return { pass: verified === 180 && total === 180 && mutatedFailed === mutated && crossFailed === cross, measured: `${verified} of ${total} verify; ${mutatedFailed} of ${mutated} one-field changes fail; ${crossFailed} of ${cross} cross-key lines fail` };
}

// a rehearsal night: every persona, needs-owner lines answered by signed, unsigned and no simon decisions, flags
function night() {
  const r = rng(1101);
  const int = (n) => Math.floor(r() * n), pick = (a) => a[int(a.length)];
  let file = '';
  const lines = () => read(file, sigOk).lines;
  const add = (o, who) => { const out = entry(o, lines()); if (!out.ok) throw new Error('rehearsal line refused: ' + out.why); const signed = who === 'simon' && o.signed !== false ? signAs(out.line, 'simon') : out.line; file = append(file, signed); return read(file, sigOk).lines.at(-1); };
  const WHAT = ['drafted the Monday money report', 'shipped the reader fix', 'read the new mentions', 'built step two', 'started the intake for a lead', 'forged the card of the day', 'checked the listing copy', 'asked Kar for the receipt', 'queued tomorrow'];
  const owner = [];
  for (let i = 0; i < 80; i++) {
    const agent = PERSONAS[i % PERSONAS.length], h = String(int(24)).padStart(2, '0');
    const ts = (i % 9 === 0 ? '2026-10-31T' : '2026-11-01T') + h + ':' + String(int(60)).padStart(2, '0') + ':00Z';
    const kind = pick(['task', 'build', 'receipt', 'listing', 'post', 'lead', 'blocker', 'note', 'handoff']);
    const x = add({ ts, agent, kind, what: pick(WHAT), link: r() < 0.5 ? 'https://e.example/r/' + i : '', needs_owner: r() < 0.3, ...(kind === 'handoff' ? { to: pick(PERSONAS) } : {}) }, agent);
    if (x.needs_owner) owner.push(x);
  }
  owner.forEach((x, i) => {
    if (i % 3 === 0) add({ ts: '2026-11-01T23:00:00Z', agent: 'simon', kind: 'decision', verdict: i % 2 ? 'deny' : 'approve', ref: x.id, what: 'decided', quote: 'ok' }, 'simon');
    if (i % 3 === 1) add({ ts: '2026-11-01T23:00:00Z', agent: 'simon', kind: 'decision', verdict: 'approve', ref: x.id, what: 'decided', signed: false }, 'nobody');
  });
  return lines();
}

function F6() {
  const L = night(), date = '2026-11-01';
  const md = rollup(L, { date });
  const blocks = {};
  let cur = null;
  for (const l of md.split('\n')) { const h = /^### (.+?) \(\d+\)$/.exec(l); if (h) { cur = h[1]; blocks[cur] = []; continue; } const id = /`([0-9a-f]{12})`/.exec(l); if (cur && id) blocks[cur].push(id[1]); }
  const short = (xs) => xs.map((x) => x.id.slice(0, 12));
  const answeredIds = new Set(L.filter((x) => x.agent === 'simon' && x.kind === 'decision' && x.signed && ['approve', 'deny'].includes(x.verdict)).map((x) => x.ref));
  const plain = { 'NEEDS SIMON': short(L.filter((x) => x.needs_owner && !answeredIds.has(x.id))), Flagged: short(L.filter((x) => dayOf(x.ts) === date && x.flags.length)) };
  const NAMES = { kar: 'Kar', builder: 'Builder', 'money-time': 'Money time', reach: 'Reach', scout: 'Scout', 'client-lead': 'Client lead', 'card-keeper': 'Card Keeper', auditor: 'Auditor', simon: 'Simon' };
  for (const a of AGENTS) { const xs = L.filter((x) => x.agent === a && dayOf(x.ts) === date); if (xs.length) plain[NAMES[a]] = short(xs); }
  const equal = JSON.stringify(Object.keys(plain)) === JSON.stringify(Object.keys(blocks)) && Object.keys(plain).every((k) => JSON.stringify(plain[k]) === JSON.stringify(blocks[k]));
  const order = md.indexOf('### NEEDS SIMON') >= 0 && Object.values(NAMES).every((n) => md.indexOf('### ' + n + ' (') < 0 || md.indexOf('### NEEDS SIMON') < md.indexOf('### ' + n + ' ('));
  const fixture = '# Agent feed\n\nWhat the box agents did.\n\n## Synced 31 Oct 2026 21:38 GMT\n\n### Grok Bot\n- posted seven slots\n\n### Needs Simon\n- payouts\n\n## Synced 30 Oct 2026 21:31 GMT\n\n- earlier\n';
  const sections = (t) => t.split(/\n(?=## )/).filter((s) => !s.startsWith("## Kar's rollup"));
  const after = insert(insert(fixture, md), md);
  const untouched = JSON.stringify(sections(after).map((s) => s.replace(/\n+$/, ''))) === JSON.stringify(sections(fixture).map((s) => s.replace(/\n+$/, ''))) && after.split("## Kar's rollup").length === 2;
  const counts = Object.fromEntries(Object.entries(plain).map(([k, v]) => [k, v.length]));
  return { pass: equal && order && untouched, measured: `${L.length} rehearsal lines; rollup blocks ${equal ? 'equal' : 'DIFFER FROM'} the plain count ${JSON.stringify(counts)}; NEEDS SIMON ${order ? 'comes first' : 'is NOT first'}; inserted twice into a copy of AGENT_FEED.md, every other section ${untouched ? 'unchanged' : 'CHANGED'}` };
}

function F7() {
  let file = '';
  const L = () => read(file, sigOk).lines;
  const add = (o, signer) => { const out = entry({ ts: TS, what: 'switch', ...o }, L()); file = append(file, signer ? signAs(out.line, signer) : out.line); return out.line; };
  const results = [];
  const want = (label, got, exp) => results.push({ label, ok: got === exp });
  for (const by of ['simon', 'kar', 'auditor']) {
    file = '';
    add({ agent: by, kind: 'decision', verdict: 'pause', ref: 'reach' }, by === 'simon' ? 'simon' : null);
    want(`pause by ${by} stops reach`, mayAct(L(), 'reach'), false);
    want(`pause by ${by} leaves the others`, PERSONAS.filter((p) => p !== 'reach').every((p) => mayAct(L(), p)), true);
    want(`reach's next line flagged while-paused (${by})`, add({ agent: 'reach', kind: 'note', what: 'drafting' }).flags.includes('while-paused'), true);
  }
  file = '';
  add({ agent: 'kar', kind: 'decision', verdict: 'pause', ref: 'team' });
  want('pause team stops all', PERSONAS.every((p) => !mayAct(L(), p)), true);
  add({ agent: 'kar', kind: 'decision', verdict: 'unpause', ref: 'team' });
  want('unpause by kar changes nothing', PERSONAS.every((p) => !mayAct(L(), p)), true);
  add({ agent: 'simon', kind: 'decision', verdict: 'unpause', ref: 'team' }, null);
  want('unsigned simon unpause changes nothing', PERSONAS.every((p) => !mayAct(L(), p)), true);
  add({ agent: 'simon', kind: 'decision', verdict: 'unpause', ref: 'team' }, 'simon');
  want('signed simon unpause restores', PERSONAS.every((p) => mayAct(L(), p)), true);
  const held = results.filter((x) => x.ok).length;
  return { pass: held === results.length, measured: `${held} of ${results.length} cases as stated`, cases: results };
}

async function F8() {
  const law = readJSON('data/team-law.json');
  const missing = [];
  for (const L of law.laws) {
    if (!Array.isArray(L.checks) || !L.checks.length) { missing.push(L.n + ': no check'); continue; }
    for (const c of L.checks) {
      if (c.at) { const m = await import(new URL(c.at, root)); if (typeof m[c.fn] !== 'function') missing.push(`${L.n}: ${c.at} ${c.fn}`); }
      else if (!(Number.isInteger(c.step) && c.step > 1) && !(typeof c.none === 'string' && c.none.length > 20)) missing.push(L.n + ': a check names nothing');
    }
  }
  const later = law.laws.filter((L) => L.checks.some((c) => c.step)).map((L) => L.n);
  return { pass: law.laws.length === 10 && missing.length === 0, measured: `${law.laws.length} laws, ${law.laws.length - new Set(missing.map((m) => m.split(':')[0])).size} mapped with every named function present; laws with a later step's check (re-checked then): ${later.join(', ')}`, missing };
}

async function measure() {
  const c = corpus();
  const claims = { ...F1F2F3(c), F2b: existsSync(file(PRIV)) ? { ...readJSON(PRIV).F2b, ci: false } : { pass: false, measured: 'not measured (run --private on Kar\'s machine)' }, F3b: F3b(), F4: F4(), F5: F5(), F6: F6(), F7: F7(), F8: await F8() };
  const order = ['F1', 'F2', 'F2b', 'F3', 'F3b', 'F4', 'F5', 'F6', 'F7', 'F8'];
  const sorted = Object.fromEntries(order.map((k) => [k, claims[k]]));
  return { kind: 'ai-first-company-team1-feed-run', seal: SEAL, corpus: shaOf(c), claims: sorted, held: order.filter((k) => sorted[k].pass).length, of: order.length };
}

async function heldout() {
  if (existsSync(file(HELD))) { console.error('✗ already generated, and kept: ' + HELD); process.exit(1); }
  const P = readJSON(PREREG).heldout.F3b;
  const ask = async (prompt) => {
    // streamed: on a CPU-only laptop the whole reply takes longer than fetch waits for headers
    const res = await fetch('http://127.0.0.1:11434/api/generate', { method: 'POST', body: JSON.stringify({ model: 'qwen2.5:7b', prompt, stream: true, options: { temperature: 0.9, seed: 11, num_predict: 2000 } }) });
    let reply = '', buf = '';
    for await (const chunk of res.body) {
      buf += Buffer.from(chunk).toString('utf8');
      const parts = buf.split('\n'); buf = parts.pop();
      for (const p of parts) if (p.trim()) reply += JSON.parse(p).response || '';
    }
    return reply.split(/\r?\n/).map((l) => l.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').trim()).filter(Boolean).slice(0, 40);
  };
  const out = { model: 'qwen2.5:7b', options: { temperature: 0.9, seed: 11, num_predict: 2000 }, generated: new Date().toISOString().slice(0, 10), after: git('rev-parse', '--short', 'HEAD'), finished: await ask(P.finished), unfinished: await ask(P.unfinished) };
  writeFileSync(file(HELD), JSON.stringify(out, null, 1) + '\n');
  console.error(`✓ held-out lines kept: ${out.finished.length} finished, ${out.unfinished.length} unfinished`);
}

// F2b: the team's real log. Every change the redactor makes is printed HERE (this terminal only) for Kar to judge;
// the receipt keeps the counts and the corpus hash, never a line.
function privateRun(judged) {
  const cfg = (() => { try { return JSON.parse(readFileSync(join(homedir(), '.team-feed', 'config.json'), 'utf8')).repo || ''; } catch { return ''; } })();
  const repo = process.env.KAR_CONTINUITY || cfg;
  if (!repo) { console.error('✗ no local continuity config'); process.exit(1); }
  const text = ['STATUS.md', 'plans/AGENT_FEED.md'].map((f) => readFileSync(join(repo, f), 'utf8').replace(/\r\n/g, '\n')).join('\n');
  const lines = text.split('\n').filter((l) => l.trim());
  const changes = [];
  for (const l of lines) { const r = redact(l); if (r.text !== l) changes.push({ hits: r.hits, before: l, after: r.text }); }
  if (!judged) { for (const [i, c] of changes.entries()) console.log(`#${i} ${JSON.stringify(c.hits)}\n  before: ${c.before.slice(0, 400)}\n  after:  ${c.after.slice(0, 400)}`); console.error(`${lines.length} lines, ${changes.length} changed — judge each, then re-run with --private --judged '<json: { falseRedactions, note }>'`); return; }
  const j = JSON.parse(judged);
  const hits = changes.reduce((a, c) => { for (const [k, v] of Object.entries(c.hits)) a[k] = (a[k] || 0) + v; return a; }, {});
  const out = { F2b: { pass: j.falseRedactions === 0, measured: `${lines.length} real log lines (sha256 ${shaOf(lines)}); ${changes.length} changed, redactions by class ${JSON.stringify(hits)}; judged line by line by Kar: ${j.falseRedactions} false. ${j.note}` }, judgedAt: new Date().toISOString().slice(0, 10) };
  writeFileSync(file(PRIV), JSON.stringify(out, null, 1) + '\n');
  console.error('✓ ' + out.F2b.measured);
}

const cmd = process.argv[2];
if (cmd === '--check') {
  if (atSeal(PREREG).trim() !== readFileSync(file(PREREG), 'utf8').replace(/\r\n/g, '\n').trim()) { console.error('✗ the step 1 seal changed since ' + SEAL); process.exit(1); }
  if (atSeal('tools/team1-corpus.mjs').trimEnd() !== readFileSync(file('tools/team1-corpus.mjs'), 'utf8').replace(/\r\n/g, '\n').trimEnd()) { console.error('✗ the test-set generator changed since ' + SEAL); process.exit(1); }
  if (shaOf(corpus()) !== readJSON(PREREG).corpus.sha256) { console.error('✗ the generated test sets differ from the sealed SHA-256'); process.exit(1); }
  console.error('✓ step 1 seal and test sets unchanged since ' + SEAL);
} else if (cmd === '--heldout') await heldout();
else if (cmd === '--private') privateRun(process.argv[3] === '--judged' ? process.argv[4] : null);
else if (cmd === '--run' || cmd === '--verify') {
  const result = await measure();
  const text = JSON.stringify(result, null, 1) + '\n';
  if (cmd === '--run') { writeFileSync(file(RUN), text); console.error(`✓ ${result.held} of ${result.of} held`); for (const [k, x] of Object.entries(result.claims)) console.error(`  ${k} ${x.pass ? 'HELD' : 'FAILED'} · ${x.measured}`); }
  else { if (readFileSync(file(RUN), 'utf8').replace(/\r\n/g, '\n') !== text) { console.error('✗ step 1 does not re-measure to the committed receipt'); process.exit(1); } console.error(`✓ step 1 re-measured: ${result.held} of ${result.of} held, identical to the committed receipt`); }
} else if (cmd) { console.error('team1-measure — --check | --heldout | --private [--judged <json>] | --run | --verify'); process.exit(2); }
