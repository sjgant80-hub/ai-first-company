#!/usr/bin/env node
// team.mjs — the bot team's feed on this machine: write a line, roll up the day, verify who wrote what, make a key.
// The feed lives in the team's private shared repo, named only in local config (~/.team-feed/config.json { repo }, or
// KAR_CONTINUITY), never here. Private keys live in ~/.team-feed/keys/ and never leave this machine; public keys are
// in the shared repo's team/keys.json so every reader can check every line.
//   node tools/team.mjs add --agent kar --kind note --what "…" [--link L] [--needs-owner] [--receipt SHA] [--to P]
//                           [--ref ID] [--verdict V] [--quote Q] [--evidence E]… [--ts ISO] [--push]
//                           [--receipt-file data/x-run.json]   (fills --link and --receipt from a committed receipt)
//   node tools/team.mjs pause <persona|team> --agent kar|auditor [--push]       (only Simon unpauses: see decide)
//   node tools/team.mjs rollup [--date YYYY-MM-DD] [--write] [--push]
//   node tools/team.mjs verify                                                  signatures, and the feed only ever grew
//   node tools/team.mjs keygen <persona>                                        (simon: run it yourself; it asks for a passphrase)
//   node tools/team.mjs decide <line id> approve|deny|unpause --quote "<your words>"   (Simon only: signs with his key)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync, createPrivateKey, createPublicKey, sign, verify, createHash } from 'node:crypto';
import { AGENTS, PERSONAS, entry, read, append, appendOnly, signingText } from '../src/feed.mjs';
import { rollup, insert } from '../src/rollup.mjs';

const cfg = () => { try { return JSON.parse(readFileSync(join(homedir(), '.team-feed', 'config.json'), 'utf8')).repo || ''; } catch { return ''; } };
export const REPO = process.env.KAR_CONTINUITY || cfg();
const FEED = join(REPO, '.estate', 'feed.jsonl'), KEYS = join(REPO, 'team', 'keys.json'), ROLL = join(REPO, 'plans', 'AGENT_FEED.md');
const KEYDIR = join(homedir(), '.team-feed', 'keys');
const git = (args) => spawnSync('git', args, { cwd: REPO, encoding: 'utf8', timeout: 60000 });
const london = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const text = (p) => (existsSync(p) ? readFileSync(p, 'utf8').replace(/\r\n/g, '\n') : '');

const publicKeys = () => { try { return JSON.parse(text(KEYS) || '{}'); } catch { return {}; } };
export function isSigned(x) {
  const k = publicKeys()[x.agent];
  if (!k || typeof x.sig !== 'string') return false;
  return verify(null, Buffer.from(signingText(x)), createPublicKey(k), Buffer.from(x.sig, 'base64'));
}
const keyFile = (who) => join(KEYDIR, who + '.pem');
function signer(who) {
  if (!existsSync(keyFile(who))) return null;
  const pem = readFileSync(keyFile(who), 'utf8');
  const passphrase = who === 'simon' ? process.env.TEAM_SIMON_PASSPHRASE : undefined;
  if (who === 'simon' && !passphrase) { console.error('✗ Simon\'s key is passphrase-locked: set TEAM_SIMON_PASSPHRASE in your own shell for this one command'); process.exit(1); }
  const key = createPrivateKey(passphrase ? { key: pem, passphrase } : pem);
  return (line) => ({ ...line, sig: sign(null, Buffer.from(signingText(line)), key).toString('base64') });
}

function pushFeed(files, msg) {
  const pull = git(['pull', '--ff-only', '--quiet']);
  if (pull.status !== 0) return '✗ git pull failed: ' + (pull.stderr || '').trim().slice(0, 200);
  const stage = git(['add', ...files]), commit = git(['commit', '-q', '-m', msg]);
  if (stage.status !== 0 || commit.status !== 0) return '✗ git commit failed: ' + (commit.stderr || stage.stderr || '').trim().slice(0, 200);
  const push = git(['push', '-q']);
  return push.status === 0 ? '✓ pushed' : '✗ committed, push failed: ' + (push.stderr || '').trim().slice(0, 200);
}

/** write one line: redacted and flagged by the writer, signed with the agent's key when it has one, appended only */
export function add(input, { push = false } = {}) {
  if (!REPO) return { ok: false, why: 'no local config naming the shared repo' };
  if (push) { const p = git(['pull', '--ff-only', '--quiet']); if (p.status !== 0) return { ok: false, why: 'git pull failed' }; }
  const before = text(FEED);
  const out = entry({ ts: new Date().toISOString(), ...input }, read(before, isSigned).lines);
  if (!out.ok) return out;
  const s = signer(out.line.agent);
  const line = s ? s(out.line) : out.line;
  const after = append(before, line);
  if (!appendOnly(before, after)) return { ok: false, why: 'refused: that write would change an earlier line' };
  mkdirSync(dirname(FEED), { recursive: true });
  writeFileSync(FEED, after);
  const pushed = push ? pushFeed(['.estate/feed.jsonl'], `feed: ${line.agent} ${line.kind} — ${line.what.slice(0, 60)}`) : null;
  return { ok: true, line, signed: Boolean(s), pushed };
}

/** a receipt committed in this repo → the link pinned to the last commit that touched it, and the SHA-256 of its bytes
 *  there: what the auditor re-hashes, so a build line cannot drift from its receipt */
export function pinnedReceipt(path) {
  const here = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const run = (a, enc = 'utf8') => spawnSync('git', a, { cwd: here, encoding: enc });
  const commit = (run(['log', '-n1', '--format=%H', '--', path]).stdout || '').trim();
  if (!/^[0-9a-f]{40}$/.test(commit)) { console.error('✗ ' + path + ' is not committed in this repo'); process.exit(1); }
  const bytes = run(['show', `${commit}:${path}`], 'buffer').stdout;
  const origin = (run(['remote', 'get-url', 'origin']).stdout || '').trim().replace(/\.git$/, '').replace(/^git@github\.com:/, 'https://github.com/');
  return { link: `${origin}/blob/${commit}/${path}`, receipt_sha256: createHash('sha256').update(bytes).digest('hex') };
}

function args(argv) {
  const o = { evidence: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1];
    if (a === '--needs-owner') o.needs_owner = true;
    else if (a === '--push') o.push = true;
    else if (a === '--write') o.write = true;
    else if (a === '--evidence') { o.evidence.push(v); i++; }
    else if (a === '--receipt') { o.receipt_sha256 = v; i++; }
    else if (a === '--receipt-file') { Object.assign(o, pinnedReceipt(v)); i++; }
    else if (a.startsWith('--')) { o[a.slice(2)] = v; i++; }
    else (o._ = o._ || []).push(a);
  }
  if (!o.evidence.length) delete o.evidence;
  return o;
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/team.mjs');
if (isMain) {
  const [cmd, ...rest] = process.argv.slice(2);
  const o = args(rest);
  if (!REPO && cmd !== 'keygen') { console.error('✗ no local config naming the shared repo (~/.team-feed/config.json)'); process.exit(1); }
  if (cmd === 'add' || cmd === 'pause') {
    const { push, write, _, ...input } = o;
    if (cmd === 'pause') Object.assign(input, { kind: 'decision', verdict: 'pause', ref: (_ || [])[0], what: input.what || 'pause ' + (_ || [])[0] });
    const r = add(input, { push });
    console.log(r.ok ? '✓ ' + JSON.stringify(r.line) + (r.signed ? '' : '  (unsigned: no key for ' + r.line.agent + ')') + (r.pushed ? '\n' + r.pushed : '') : '✗ ' + r.why);
    process.exit(r.ok ? 0 : 1);
  } else if (cmd === 'rollup') {
    if (o.push) git(['pull', '--ff-only', '--quiet']);
    const date = o.date || london(), sec = rollup(read(text(FEED), isSigned).lines, { date });
    if (!o.write) { console.log(sec); process.exit(0); }
    writeFileSync(ROLL, insert(text(ROLL), sec));
    console.log('✓ rollup for ' + date + ' written' + (o.push ? '\n' + pushFeed(['plans/AGENT_FEED.md'], "AGENT_FEED: Kar's rollup " + date) : ''));
  } else if (cmd === 'verify') {
    const { lines, skipped } = read(text(FEED), isSigned);
    const by = {};
    for (const x of lines) { const b = (by[x.agent] = by[x.agent] || { lines: 0, signed: 0 }); b.lines++; if (x.signed) b.signed++; }
    const log = git(['log', '--format=%H', '--', '.estate/feed.jsonl']).stdout.trim().split('\n').filter(Boolean).reverse();
    let prev = '', broken = [];
    for (const c of log) { const t = git(['show', `${c}:.estate/feed.jsonl`]).stdout || ''; if (!appendOnly(prev, t)) broken.push(c.slice(0, 7)); prev = t; }
    if (!appendOnly(prev, text(FEED))) broken.push('working copy');
    console.log(JSON.stringify({ lines: lines.length, skipped, byAgent: by, commits: log.length, onlyGrew: broken.length === 0, broken }, null, 1));
    process.exit(broken.length || skipped ? 1 : 0);
  } else if (cmd === 'keygen') {
    const who = (o._ || [])[0];
    if (!AGENTS.includes(who)) { console.error('✗ keygen <' + AGENTS.join('|') + '>'); process.exit(2); }
    if (existsSync(keyFile(who))) { console.error('✗ ' + who + ' already has a key; rotating one is Simon\'s call'); process.exit(1); }
    const passphrase = who === 'simon' ? process.env.TEAM_SIMON_PASSPHRASE : undefined;
    if (who === 'simon' && !(passphrase && passphrase.length >= 12)) { console.error('✗ Simon makes his own key: set TEAM_SIMON_PASSPHRASE (12+ characters, yours alone) in your own shell, then run this'); process.exit(1); }
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    mkdirSync(KEYDIR, { recursive: true });
    writeFileSync(keyFile(who), privateKey.export(passphrase ? { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase } : { type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    const keys = publicKeys(); keys[who] = publicKey.export({ type: 'spki', format: 'pem' });
    if (REPO) { mkdirSync(dirname(KEYS), { recursive: true }); writeFileSync(KEYS, JSON.stringify(keys, null, 1) + '\n'); }
    console.log('✓ ' + who + "'s key made; the public half is in the shared repo's team/keys.json (commit it)");
  } else if (cmd === 'decide') {
    const [id, verdict] = o._ || [];
    if (!['approve', 'deny', 'unpause'].includes(verdict) || !o.quote) { console.error('✗ decide <line id> approve|deny|unpause --quote "<your words>"'); process.exit(2); }
    if (!existsSync(keyFile('simon'))) { console.error('✗ no key for Simon on this machine: make it first (keygen simon); nothing was written'); process.exit(1); }
    const ref = verdict === 'unpause' ? id : (read(text(FEED), isSigned).lines.find((x) => x.id.startsWith(id)) || {}).id;
    if (!ref) { console.error('✗ no line starts ' + id); process.exit(1); }
    const r = add({ agent: 'simon', kind: 'decision', verdict, ref, quote: o.quote, what: verdict + ' ' + ref.slice(0, 12) }, { push: o.push });
    console.log(r.ok && r.signed ? '✓ signed: ' + JSON.stringify(r.line) : '✗ ' + (r.why || 'not signed: make your key first (keygen simon)'));
    process.exit(r.ok && r.signed ? 0 : 1);
  } else { console.error('team — add | pause | rollup | verify | keygen | decide (see the header of tools/team.mjs)'); process.exit(2); }
}
