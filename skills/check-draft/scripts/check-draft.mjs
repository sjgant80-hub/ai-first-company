#!/usr/bin/env node
// check-draft: may this post or listing go out? The auditor (src/auditor.mjs) reads the draft before it does.
// It gathers the facts the kernel needs, then judges with the same kernel the feed audit uses:
//   · the link's bytes (a GitHub blob pinned to a commit is read raw at that commit; a repo link reads its README)
//   · whether the linked repo has a LICENSE file (GitHub's licence API)
//   · the private lists: holds (claims that must not be said yet), in-house jargon, partner consent (team/*.json in the
//     shared repo, never in this public code)
//   node skills/check-draft/scripts/check-draft.mjs --text "…" [--link URL] [--kind post|listing] [--holds file]
//   exit 0 only on PASS; a FLAG or FAIL goes to Kar, not out
import { readFileSync } from 'node:fs';
import { audit } from '../../../src/auditor.mjs';
import { consentNow, jargonNow, holdsNow, rosterNow } from '../../../tools/audit.mjs';

const arg = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : undefined; };
const text = arg('--text'), link = arg('--link') || '', kind = arg('--kind') || 'post';
if (!text) { console.error('usage: check-draft.mjs --text "…" [--link URL] [--kind post|listing] [--holds file]'); process.exit(2); }

/** the repo a link names: a GitHub URL, or a GitHub Pages URL of this org */
export function repoOf(url) {
  const g = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)/.exec(url);
  if (g) return g[1] + '/' + g[2].replace(/\.git$/, '');
  const p = /^https:\/\/([\w-]+)\.github\.io\/([\w.-]+)/.exec(url);
  return p ? p[1] + '/' + p[2] : null;
}
/** where to read a link's bytes: a pinned blob raw at its commit, a repo's README, any other URL as it is */
export function rawOf(url) {
  const b = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/blob\/([0-9a-f]{7,40})\/(\S+)$/.exec(url);
  if (b) return 'https://raw.githubusercontent.com/' + b[1] + '/' + b[2] + '/' + b[3];
  const r = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/?$/.exec(url);
  if (r) return 'https://raw.githubusercontent.com/' + r[1] + '/HEAD/README.md';
  return url;
}
const gh = (path) => fetch('https://api.github.com/' + path, { headers: { accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { authorization: 'Bearer ' + process.env.GITHUB_TOKEN } : {}) } });

const facts = {};
if (link) {
  try { const r = await fetch(rawOf(link)); facts.linked = r.ok ? { found: true, text: await r.text() } : { found: false, status: r.status }; }
  catch (e) { facts.linked = { found: false, error: String(e.message || e) }; }
  const repo = repoOf(link);
  if (repo) {
    try { const r = await gh('repos/' + repo + '/license'); if (r.status === 200) facts.licence = { repo, found: true }; else if (r.status === 404) facts.licence = { repo, found: false }; }
    catch { /* unknown: no licence finding either way */ }
  }
}
const holds = arg('--holds') ? JSON.parse(readFileSync(arg('--holds'), 'utf8')).holds : holdsNow();
const ctx = { roster: rosterNow(), lines: [], consent: consentNow(), jargon: jargonNow(), holds };
const line = { agent: 'reach', kind, what: text, link };
const r = audit(line, facts, ctx);
console.log(JSON.stringify({ verdict: r.verdict, link: link || null, checks: r.checks }, null, 1));
process.exit(r.verdict === 'PASS' ? 0 : 1);
