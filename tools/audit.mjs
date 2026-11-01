#!/usr/bin/env node
// audit.mjs — the auditor as its own process: read the team's feed, gather the facts for every line that needs a
// verdict (the receipt's bytes at its pinned commit, the seal's place in history, the receipt's --verify re-run on a
// clean copy, the local model's flags on posts and listings), judge with src/auditor.mjs, and write each verdict as a
// line signed with the auditor's key. It never builds or fixes: the only file it writes is the feed.
//   node tools/audit.mjs                    print the verdicts it would write
//   node tools/audit.mjs --rerun            also re-run each build receipt's --verify (slow)
//   node tools/audit.mjs --write [--push]   append the verdicts to the feed (signed), and push the feed alone
import { readFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { read } from '../src/feed.mjs';
import { audit, auditable, pinOf, verdicts } from '../src/auditor.mjs';
import { REPO, isSigned, add } from './team.mjs';

export const MODEL = 'qwen2.5:7b';
export const CONFIG = 'auditor-v1';
export const OPTIONS = Object.freeze({ temperature: 0, seed: 7, num_predict: 300 });
export const PROMPT = (text) => [
  "You check a short piece of writing before a small company's owner sees it. Find only these problems:",
  'OVERCLAIM: a promise of earnings or savings, a guarantee, crypto or token-sale talk, a claim to be the best, the only or the first, or an impressive number with no source.',
  'ASSUMPTION: something it takes for granted about the reader or the result that may not be true.',
  'JARGON: a word an ordinary business owner would not know.',
  'Answer with one line per problem, starting OVERCLAIM:, ASSUMPTION: or JARGON:, then the exact words from the text in quotes. If there is no problem, answer NONE.',
  '', 'Text: ' + text,
].join('\n');
export const parseJudge = (reply) => String(reply || '').split(/\r?\n/).map((l) => /^\s*(OVERCLAIM|ASSUMPTION|JARGON)\s*:\s*"?(.*?)"?\s*$/i.exec(l)).filter(Boolean).map((m) => ({ label: m[1].toUpperCase(), quote: m[2] }));
const sha = (b) => createHash('sha256').update(b).digest('hex');
const ROOT = new URL('../', import.meta.url);
const RERUN = { 'ai-first-company-team1-feed-run': 'tools/team1-measure.mjs', 'ai-first-company-team2-roster-run': 'tools/team2-measure.mjs', 'ai-first-company-team2b-run': 'tools/team2b-measure.mjs', 'ai-first-company-team3-auditor-run': 'tools/team3-measure.mjs', 'ai-first-company-step1-conductor-run': 'tools/step1-measure.mjs', 'ai-first-company-step1b-conductor-run': 'tools/step1b-measure.mjs', 'ai-first-company-step3-reach-run': 'tools/step3-measure.mjs', 'ai-first-company-step4-funnel-run': 'tools/step4-measure.mjs', 'ai-first-company-step5-ops-run': 'tools/step5-measure.mjs', 'ai-first-company-step6-oversight-run': 'tools/step6-measure.mjs', 'ai-first-company-cycle-run': 'tools/step7-measure.mjs' };

/** a local clone of an owner/name repo: this repo itself, or a sibling folder of it */
export function cloneOf(repo) {
  const name = String(repo || '').split('/')[1] || '';
  if (!/^sjgant80-hub\/[\w.-]+$/.test(String(repo))) return null;
  const p = join(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), name);
  return existsSync(join(p, '.git')) ? p : null;
}
const gitIn = (dir, args, enc = 'utf8') => spawnSync('git', args, { cwd: dir, encoding: enc, timeout: 60000, maxBuffer: 64 * 1024 * 1024 });

/** the local model's flags on a post or listing (cached by the text's hash, so a re-run reads the same replies) */
export async function judgeOf(text, cache) {
  const key = sha(CONFIG + '\n' + text);
  if (cache && cache[key]) return cache[key];
  const res = await fetch('http://127.0.0.1:11434/api/generate', { method: 'POST', body: JSON.stringify({ model: MODEL, prompt: PROMPT(text), stream: true, options: OPTIONS }) });
  let reply = '', buf = '';
  for await (const chunk of res.body) { buf += Buffer.from(chunk).toString('utf8'); const parts = buf.split('\n'); buf = parts.pop(); for (const p of parts) if (p.trim()) reply += JSON.parse(p).response || ''; }
  const out = { model: MODEL, config: CONFIG, options: OPTIONS, reply, flags: parseJudge(reply) };
  if (cache) cache[key] = out;
  return out;
}

/** every fact the kernel needs about one line; the I/O lives here, the judgement in src/auditor.mjs */
export async function factsFor(line, { rerun = false, judge = false, cache = null } = {}) {
  const facts = {};
  const pin = pinOf(line.link);
  if (pin) {
    const dir = cloneOf(pin.repo);
    let bytes = null;
    if (dir) { const r = gitIn(dir, ['show', `${pin.commit}:${pin.path}`], 'buffer'); if (r.status === 0) bytes = r.stdout; }
    if (!bytes) { try { const r = await fetch(`https://raw.githubusercontent.com/${pin.repo}/${pin.commit}/${pin.path}`); if (r.status === 200) bytes = Buffer.from(await r.arrayBuffer()); } catch { /* offline: not found */ } }
    facts.receipt = bytes ? { found: true, sha256: sha(bytes), text: bytes.toString('utf8') } : { found: false };
    if (bytes && line.kind === 'build' && dir) {
      let named = '';
      try { named = String(JSON.parse(bytes.toString('utf8')).seal || ''); } catch { named = ''; }
      const full = (c) => (gitIn(dir, ['rev-parse', '--verify', '--quiet', c + '^{commit}']).stdout || '').trim();
      const s = named ? full(named) : '';
      facts.seal = { named, ancestor: Boolean(s) && s !== pin.commit && gitIn(dir, ['merge-base', '--is-ancestor', s, pin.commit]).status === 0 };
      let kind = '';
      try { kind = JSON.parse(bytes.toString('utf8')).kind || ''; } catch { kind = ''; }
      if (rerun && RERUN[kind]) {
        const tmp = mkdtempSync(join(tmpdir(), 'audit-'));
        const wt = join(tmp, 'copy');
        gitIn(dir, ['worktree', 'add', '--detach', '--quiet', wt, pin.commit]);
        const cmd = `node ${RERUN[kind]} --verify`;
        const r = spawnSync('node', [RERUN[kind], '--verify'], { cwd: wt, encoding: 'utf8', timeout: 600000 });
        facts.rerun = { ran: true, exit: r.status === null ? -1 : r.status, cmd: `${cmd} at ${pin.commit.slice(0, 7)}` };
        gitIn(dir, ['worktree', 'remove', '--force', wt]);
        try { rmSync(tmp, { recursive: true, force: true }); } catch { /* left for the OS */ }
      }
    }
  }
  if (judge && (line.kind === 'post' || line.kind === 'listing')) facts.judge = (await judgeOf(line.what, cache)).flags;
  return facts;
}

export const rosterNow = () => JSON.parse(readFileSync(new URL('data/roster.json', ROOT), 'utf8'));
export const consentNow = () => { try { return JSON.parse(readFileSync(join(REPO, 'team', 'consent.json'), 'utf8')); } catch { return { partners: [] }; } };
/** in-house words a buyer would not know, kept in the shared repo so this public code never names them */
export const jargonNow = () => { try { const j = JSON.parse(readFileSync(join(REPO, 'team', 'jargon.json'), 'utf8')); return Array.isArray(j.words) ? j.words : []; } catch { return []; } };

/** the verdict line the auditor writes for one audited line */
export function verdictLine(line, result) {
  const bad = result.checks.filter((c) => c.result !== 'ok');
  const said = bad.length ? bad.map((c) => c.evidence).join('; ') : result.checks.map((c) => c.evidence).join('; ');
  return { agent: 'auditor', kind: 'receipt', verdict: result.verdict, ref: line.id, what: `${result.verdict} on ${line.agent}'s ${line.kind}: ${said}`.slice(0, 600), link: 'feed:' + line.id, evidence: result.checks.map((c) => `${c.check} ${c.result}: ${c.evidence}`) };
}

/** audit the shared feed: every auditable line that has no signed verdict yet */
export async function auditFeed({ rerun = false, judge = true, cache = {} } = {}) {
  const text = existsSync(join(REPO, '.estate', 'feed.jsonl')) ? readFileSync(join(REPO, '.estate', 'feed.jsonl'), 'utf8') : '';
  const { lines } = read(text, isSigned);
  const ctx = { roster: rosterNow(), lines, consent: consentNow(), jargon: jargonNow() }, done = verdicts(lines);
  const out = [];
  for (const line of lines) {
    if (!auditable(line, ctx) || done[line.id]) continue;
    const facts = await factsFor(line, { rerun, judge, cache });
    out.push({ line, facts, result: audit(line, facts, ctx) });
  }
  return out;
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/audit.mjs');
if (isMain) {
  const has = (f) => process.argv.includes(f);
  if (!REPO) { console.error('✗ no local config naming the shared repo'); process.exit(1); }
  const cacheFile = join(REPO, '.estate', 'judge-cache.json');
  const cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};
  const results = await auditFeed({ rerun: has('--rerun'), cache });
  for (const { line, result } of results) {
    console.log(`${result.verdict.padEnd(4)} ${line.id.slice(0, 12)} ${line.agent} ${line.kind}: ${line.what.slice(0, 90)}`);
    for (const c of result.checks) console.log(`       ${c.result.padEnd(4)} ${c.check}: ${c.evidence}`);
    if (has('--write')) { const r = add(verdictLine(line, result)); console.log(r.ok ? `       → written${r.signed ? ', signed' : ' UNSIGNED (no auditor key)'}` : '       ✗ ' + r.why); }
  }
  if (Object.keys(cache).length) writeFileSync(cacheFile, JSON.stringify(cache, null, 1) + '\n');
  if (!results.length) console.log('nothing new to audit');
  if (has('--write') && has('--push') && results.length) {
    const g = (a) => spawnSync('git', a, { cwd: REPO, encoding: 'utf8' });
    g(['add', '.estate/feed.jsonl', ...(existsSync(cacheFile) ? ['.estate/judge-cache.json'] : [])]);
    const c = g(['commit', '-q', '-m', `feed: the auditor's verdicts on ${results.length} line(s)`]);
    const p = c.status === 0 ? g(['push', '-q']) : c;
    console.log(p.status === 0 ? '✓ pushed' : '✗ ' + (p.stderr || '').trim().slice(0, 200));
  }
}
