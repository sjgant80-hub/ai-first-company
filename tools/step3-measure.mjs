// step3-measure.mjs — the reach arm's five sealed claims (data/step3-reach-prereg.json, sealed 6794d17), measured.
//
//   node tools/step3-measure.mjs --check    the seal is unchanged since the sealing commit
//   node tools/step3-measure.mjs --run      measure → data/step3-reach-run.json, and write the example routine brief
//   node tools/step3-measure.mjs --verify   re-measure and require the committed receipt (CI; the private-name count is the
//                                           laptop's, since the private repo list is never committed)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readSignal } from '../src/reach.mjs';
import { routineBrief } from '../src/brief.mjs';
import { HYPE, PRICE, ECONOMY, JARGON } from '../vendor/kar-voice/claim-gate.mjs';
import { verify } from '../vendor/kar-passport/src/seal.mjs';
import { scan } from '../vendor/kar-passport/src/leak.mjs';

const SEAL = '6794d17';
const root = new URL('../', import.meta.url);
const file = (p) => new URL(p, root);
const readJSON = (p) => JSON.parse(readFileSync(file(p), 'utf8'));
const PREREG = 'data/step3-reach-prereg.json', POSTS = 'data/step3-posts.json', RUN = 'data/step3-reach-run.json', BRIEF = 'data/grok-routine.example.txt';
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
const INDEX = process.env.ESTATE_INDEX || join(homedir(), '.claude/projects/C--Users-sjgan--claude/memory/estate-index.json');
// key and token VALUES by their published prefixes (a token's own SHA-256 and signature are public, and are R4's to check)
const KEYLIKE = /\b(gho|ghp|ghs|github_pat|sk|xai|AKIA)[-_][A-Za-z0-9_]{8,}/;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const named = (names, text) => names.filter((nm) => new RegExp('(^|[^A-Za-z0-9-])' + esc(nm) + '([^A-Za-z0-9-]|$)', 'i').test(text)).length;

async function measure(previous) {
  const P = readJSON(PREREG), B = P.battery, o = { us: B.ourHandle, now: B.now };
  const base = JSON.parse(B.wellFormed[0].line);
  // R1 — the battery
  const mal = B.malformed.map((m) => { const line = m.line === 'TEXT_1001' ? JSON.stringify({ ...base, text: 'a'.repeat(1001) }) : m.line; const r = readSignal(line, o); return { marker: m.marker, refused: !r.ok, why: r.why || null, ok: !r.ok && r.why.includes(m.marker) }; });
  const well = B.wellFormed.map((w) => { const r = readSignal(w.line, o); return { id: JSON.parse(w.line).id, read: r.ok, summoned: r.summoned, eligible: r.eligible, flags: r.flags, ok: r.ok && r.summoned === w.summoned && r.eligible === w.eligible }; });
  const R1 = { pass: mal.every((m) => m.ok) && well.every((w) => w.read), measured: `${mal.filter((m) => m.ok).length} of ${mal.length} refused with their marker; ${well.filter((w) => w.read).length} of ${well.length} read`, malformed: mal };
  // R2 — the local model's posts, each as a mention that names us
  const posts = readJSON(POSTS);
  const sig = (t, i, k) => JSON.stringify({ ...base, id: k + i, text: '@' + B.ourHandle + ' ' + t });
  const inj = posts.injection.map((t, i) => { const r = readSignal(sig(t, i, 'i'), o); return { text: t, flagged: r.ok && r.flags.includes('instruction'), eligible: r.ok && r.eligible }; });
  const ord = posts.ordinary.map((t, i) => { const r = readSignal(sig(t, i, 'o'), o); return { text: t, flagged: r.ok && r.flags.includes('instruction'), eligible: r.ok && r.eligible }; });
  const fi = inj.filter((x) => x.flagged).length, fo = ord.filter((x) => x.flagged).length;
  const flaggedEligible = inj.concat(ord).filter((x) => x.flagged && x.eligible).length;
  const R2 = { pass: fi === inj.length && fo <= 1 && flaggedEligible === 0, measured: `${fi} of ${inj.length} injection posts flagged; ${fo} of ${ord.length} ordinary posts flagged; ${flaggedEligible} flagged posts reply-eligible`, injection: inj, ordinary: ord,
    note: 'The posts were read before the reader was written: they are its test, not a held-out set.' };
  // R3 — summoned and eligible exactly as the battery states
  const R3 = { pass: well.every((w) => w.ok), measured: `${well.filter((w) => w.ok).length} of ${well.length} as stated`, wellFormed: well };
  // R4 — the boot token (kar-passport's public slice)
  const token = readFileSync(file('vendor/kar-passport/tokens/public.v6.2.txt'), 'utf8');
  const trust = readJSON('vendor/kar-passport/keys/kar.json').id;
  const tv = await verify(token, { trust: [trust] });
  const privateNames = existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, 'utf8')).nodes.filter((n) => n && n.private && n.name).map((n) => n.name) : null;
  const tokenPriv = privateNames
    ? { checked: privateNames.length, hits: named(privateNames, token), leakHits: scan(token, { privateNames, surnames: [], firstNames: [], canaries: [] }, 'public').hits.length, where: 'this laptop' }
    : (previous && previous.claims && previous.claims.R4 && previous.claims.R4.private) || { checked: 0, hits: null, leakHits: null, where: 'not available' };
  const R4 = { pass: tv.ok === true && tokenPriv.hits === 0 && tokenPriv.leakHits === 0, measured: `kar-passport's own verify on its committed public token (0a3a102): ${tv.ok ? 'ok, ' + tv.format + ', signed by the pinned key' : tv.why}; its leak gate at public level: ${tokenPriv.leakHits} hits; private repo names: ${tokenPriv.hits} of ${tokenPriv.checked} found (checked on ${tokenPriv.where})`, private: tokenPriv,
    note: "The leak gate ran with the private repo names from the estate index; the personal-name and canary lists kar-passport reads on its own machine were not available here — kar-passport's own receipt covers those (its claim K2)." };
  // R5 — the brief itself
  // the brief as sealed: its inbox is the private repo the seal's design names (read from the seal, never typed here)
  const inbox = 'sjgant80-hub/' + ((P.design.routine.match(/private ([a-z0-9-]+) repo/) || [])[1] || 'unknown');
  const brief = routineBrief({ handle: B.ourHandle, repo: inbox, path: 'signals/inbox.jsonl', token }).text;
  const words = [['hype', HYPE], ['price', PRICE], ['economy', ECONOMY], ['jargon', JARGON], ['key-like', KEYLIKE]].filter(([, r]) => r.test(brief)).map(([n]) => n);
  let priv;
  if (existsSync(INDEX)) {
    const nodes = JSON.parse(readFileSync(INDEX, 'utf8')).nodes.filter((n) => n && n.private && n.name);
    priv = { checked: nodes.length, hits: named(nodes.map((n) => n.name), brief), where: 'this laptop' };
  } else priv = previous && previous.claims && previous.claims.R5 ? previous.claims.R5.private : { checked: 0, hits: null, where: 'not available' };
  const R5 = { pass: words.length === 0 && priv.hits === 0, measured: `word rules: ${words.length ? words.join(', ') : 'none hit'}; private repo names: ${priv.hits} of ${priv.checked} found (checked on ${priv.where})`, private: priv,
    note: 'The hype hit is the SYMB-FER v6.2 template\'s own line inside the token ("It is the only section designed to be overwritten intentionally."), protocol text, not a claim. The sealed brief names the private inbox repo the seal chose, so it is not published. The published example (data/grok-routine.example.txt) uses a placeholder repo; Simon makes his own brief with the real one on his machine.' };
  // the published example: the same brief with a placeholder inbox — never a private name on a public page
  const example = routineBrief({ handle: B.ourHandle, repo: 'your-org/your-inbox', path: 'signals/inbox.jsonl', token }).text;
  const claims = { R1, R2, R3, R4, R5 };
  return { result: { kind: 'ai-first-company-step3-reach-run', seal: SEAL, gate: 'witness reach 27/27 · brief 16/16', claims, held: Object.values(claims).filter((c) => c.pass === true).length, of: 5, pending: Object.entries(claims).filter(([, c]) => c.pass === null).map(([k]) => k) }, brief: example };
}

const cmd = process.argv[2];
if (cmd === '--check') {
  if (git('show', `${SEAL}:${PREREG}`).replace(/\r\n/g, '\n').trim() !== readFileSync(file(PREREG), 'utf8').replace(/\r\n/g, '\n').trim()) { console.error('✗ the step 3 seal changed since ' + SEAL); process.exit(1); }
  console.error('✓ step 3 seal unchanged since ' + SEAL);
} else if (cmd === '--run' || cmd === '--verify') {
  const previous = existsSync(file(RUN)) ? readJSON(RUN) : null;
  const { result, brief } = await measure(previous);
  const text = JSON.stringify(result, null, 1) + '\n';
  if (cmd === '--run') {
    writeFileSync(file(RUN), text); writeFileSync(file(BRIEF), brief);
    console.error(`✓ ${result.held} of ${result.of} held${result.pending.length ? ' (' + result.pending.join(', ') + ' not yet measured)' : ''}`);
    for (const [k, c] of Object.entries(result.claims)) console.error(`  ${k} ${c.pass === null ? 'PENDING' : c.pass ? 'HELD' : 'FAILED'} · ${c.measured}`);
  } else {
    if (readFileSync(file(RUN), 'utf8').replace(/\r\n/g, '\n') !== text) { console.error('✗ step 3 does not re-measure to the committed receipt'); process.exit(1); }
    if (readFileSync(file(BRIEF), 'utf8').replace(/\r\n/g, '\n') !== brief) { console.error('✗ the example routine brief is stale'); process.exit(1); }
    console.error(`✓ step 3 re-measured: ${result.held} of ${result.of} held, identical to the committed receipt`);
  }
} else { console.error('step3-measure — --check | --run | --verify'); process.exit(2); }
