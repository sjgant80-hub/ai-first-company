// team1-corpus.mjs — the bot team's step 1 test sets, generated from a fixed seed and sealed (by their SHA-256) in
// data/team1-feed-prereg.json BEFORE the feed writer exists. The planted secrets are built here at run time, so no
// secret-shaped string is ever committed (they are fake: random characters in the published shapes).
//   node tools/team1-corpus.mjs            → print the corpus's SHA-256 and its counts
//   import { corpus } from './team1-corpus.mjs'
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const B62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const UPN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const HEX = '0123456789abcdef';
const DIG = '0123456789';
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const B64U = B62 + '-_';

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function corpus(seed = 20261101) {
  const r = rng(seed);
  const int = (n) => Math.floor(r() * n);
  const pick = (a) => a[int(a.length)];
  const s = (n, abc) => Array.from({ length: n }, () => abc[int(abc.length)]).join('');
  const luhnDigit = (body) => { let sum = 0; for (let i = 0; i < body.length; i++) { let d = +body[body.length - 1 - i]; if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; } sum += d; } return String((10 - (sum % 10)) % 10); };
  const card = (prefix, len) => { const body = prefix + s(len - prefix.length - 1, DIG); return body + luhnDigit(body); };
  const group = (num, sizes, sep) => { const out = []; let i = 0; for (const z of sizes) { out.push(num.slice(i, i + z)); i += z; } return out.join(sep); };

  const THINGS = ['the Agensi payout', 'the kar-tally listing', 'Card Keeper batch 7', 'the mint-a-node intake', 'the witness re-run', 'the morning rollup', 'the copy-gate ZIP', 'the client baseline pack', 'the reader fix', 'the SkillHQ sales check'];
  const AROUND = [
    (x) => `Set up ${pick(THINGS)}; use ${x} for it`,
    (x) => `Pasted the deploy log: ${x}`,
    (x) => `${pick(THINGS)} needs ${x} before it runs`,
    (x) => `Found ${x} in the old config while checking ${pick(THINGS)}`,
    (x) => `Note for Kar: ${x} (from the box)`,
    (x) => `Blocked: ${pick(THINGS)} wants ${x} — sent to Simon`,
  ];

  // ── secrets, by class: the fake value (what must vanish) and the line it sits in ──
  const keyMakers = [
    () => 'sk-' + s(48, B62),
    () => 'sk-ant-api03-' + s(93, B64U) + 'AA',
    () => 'gh' + pick(['p', 'o', 'u', 's', 'r']) + '_' + s(36, B62),
    () => 'github_pat_' + s(22, B62) + '_' + s(59, B62),
    () => 'xai-' + s(80, B62),
    () => 'AKIA' + s(16, UPN),
    () => pick(['sk_live_', 'rk_live_', 'sk_test_']) + s(24 + int(40), B62),
    () => 'xoxb-' + s(11, DIG) + '-' + s(13, DIG) + '-' + s(24, B62),
    () => 'AIza' + s(35, B64U),
    () => '-----BEGIN ' + pick(['', 'RSA ', 'OPENSSH ', 'EC ']) + 'PRIVATE KEY----- ' + s(64, B62 + '+/') + ' -----END PRIVATE KEY-----',
  ];
  const tokenMakers = [
    () => 'Authorization: Bearer ' + s(40, B62 + '.-_'),
    () => 'eyJ' + s(20, B64U) + '.eyJ' + s(40, B64U) + '.' + s(43, B64U),
    () => 'https://api.example.com/v1/sync?' + pick(['access_token', 'token', 'api_key', 'apikey', 'key', 'secret', 'password']) + '=' + s(32, B62),
    () => pick(['token', 'api_key', 'apikey', 'secret', 'password', 'passwd', 'client_secret', 'auth_token']) + pick(['=', ': ', ' = ', '="']) + s(20 + int(20), B62 + '!#%'),
    () => 'npm_' + s(36, B62),
    () => 'hf_' + s(34, B62),
    () => 'whsec_' + s(32, B62),
  ];
  const emailMakers = [
    () => pick(['simon', 'grok', 'jane.doe', 'ops', 'a.b', 'sales']) + pick(['', '+agensi', '.2026', '_x']) + '@' + pick(['example.com', 'mail.example.co.uk', 'gmail.com', 'proton.me', 'company.io', 'sub.domain.org']),
  ];
  const emailWrap = [(e) => e, (e) => '<' + e + '>', (e) => 'mailto:' + e, (e) => '(' + e + ')', (e) => '"' + e + '"'];
  const cardMakers = [
    () => group(card('4', 16), [4, 4, 4, 4], pick([' ', '-', ''])),
    () => group(card(String(51 + int(5)), 16), [4, 4, 4, 4], pick([' ', '-', ''])),
    () => group(card(String(2221 + int(500)), 16), [4, 4, 4, 4], pick([' ', '-', ''])),
    () => group(card(pick(['34', '37']), 15), [4, 6, 5], pick([' ', '-', ''])),
    () => group(card('6011', 16), [4, 4, 4, 4], pick([' ', '-', ''])),
  ];
  const planted = [];
  const plant = (cls, makers, n, wrap) => { for (let i = 0; i < n; i++) { const v = makers[i % makers.length](); const shown = wrap ? wrap[i % wrap.length](v) : v; planted.push({ cls, secret: v, what: pick(AROUND)(shown) }); } };
  plant('key', keyMakers, 60);
  plant('token', tokenMakers, 60);
  plant('email', emailMakers, 60, emailWrap);
  plant('card', cardMakers, 60);

  // ── clean lines that only LOOK like secrets: the writer must leave every one exactly as it is ──
  const failLuhn = () => { const n = card('4', 16); return n.slice(0, 15) + String((+n[15] + 1 + int(9)) % 10); };
  const cleanMakers = [
    () => `receipt sha256 ${s(64, HEX)} re-hashed and matched`,
    () => `commit ${s(40, HEX)} pushed to the public repo`,
    () => `fixed in ${s(7, HEX)}; CI green`,
    () => `card of the day, code ${s(4, B32)}-${s(4, B32)}-${s(4, B32)}-${s(4, B32)}, seal ${s(8, HEX)}…${s(8, HEX)}`,
    () => `posted https://x.com/ainativesol/status/21${s(17, DIG)}`,
    () => `https://github.com/sjgant80-hub/ai-first-company/commit/${s(40, HEX)}`,
    () => `run at 2026-11-0${1 + int(8)}T0${int(10)}:${10 + int(50)}:${10 + int(50)}.000Z took ${int(900)} ms`,
    () => `witness ${int(90)}/${90 + int(10)}, tests ${int(200)}/${200 + int(20)}`,
    () => `node v24.${int(30)}.${int(9)} on the box; witness v0.${int(9)}`,
    () => `order ref ${failLuhn()} (not a card: fails the check digit)`,
    () => pick(["Kar's key signs the genome and the card seal", 'the token budget hit 80% tonight', 'API key pending from Simon', 'password reset blocked by a CAPTCHA, sent to Simon', 'the secret stays in the vault, never in the feed', 'rotate the key after the trial batch']),
    () => `@ainativesol replied to @${pick(['donezohq', 'QuanticASI', 'CCIE4K'])}; 3 likes`,
    () => `cloned git@github.com:sjgant80-hub/${pick(['witness', 'kar-mind', 'post-proof'])}.git`,
    () => `installed @types/node and @${pick(['vercel', 'anthropic-ai'])}/${pick(['ms', 'sdk'])}`,
    () => `13 drafts ready; ${int(9)} skills live; batch of 1,000 re-checked`,
    () => `phone line not wired; ${s(4, DIG)}-${s(2, DIG)}-${s(2, DIG)} is the release date`,
  ];
  const clean = [];
  for (let i = 0; i < 240; i++) clean.push({ cls: 'clean', what: cleanMakers[i % cleanMakers.length]() });

  // ── done-claims with and without a link, and lines that claim nothing ──
  const DONE = ['done', 'finished', 'complete', 'completed', 'shipped', 'live', 'fixed', 'passed', 'built', 'merged', 'released', 'published', 'deployed', 'delivered', 'verified', 'proven', 'green', 'landed', 'resolved', 'sealed', 'posted', 'sent', 'submitted', 'forged'];
  const SAY = [(t, w) => `${t} ${w}`, (t, w) => `${w}: ${t}`, (t, w) => `${t} is ${w} now`, (t, w) => `${t} — ${w} today`, (t, w) => `${w[0].toUpperCase() + w.slice(1)}! ${t}`];
  const claims = [];
  for (let i = 0; i < 60; i++) claims.push({ word: DONE[i % DONE.length], what: SAY[i % SAY.length](pick(THINGS), DONE[i % DONE.length]) });
  const NOT = [(t) => `started ${t}`, (t) => `drafting ${t}`, (t) => `blocked on Stripe for ${t}`, (t) => `asked Simon about ${t}`, (t) => `planning ${t} for tonight`, (t) => `${t} not live until Simon connects Stripe`, (t) => `${t} is not done yet`, (t) => `waiting on Grok for ${t}`, (t) => `reading the rules before ${t}`, (t) => `queued ${t} for the night run`, (t) => `${t} never shipped; the failure stays on the record`, (t) => `${t} isn't fixed yet`];
  const nonclaims = [];
  for (let i = 0; i < 30; i++) nonclaims.push({ what: NOT[i % NOT.length](pick(THINGS)) });

  return { seed, planted, clean, claims, nonclaims, doneWords: DONE };
}

/** the real public text the writer must also leave alone: this repo's README lines and every sealed claim, at a commit */
export function realText(readAt) {
  const lines = readAt('README.md').split(/\r?\n/).filter((l) => l.trim());
  const claims = ['step1-conductor', 'step1b', 'step3-reach', 'step4-funnel', 'step5-ops', 'step6-oversight', 'step7-cycle']
    .flatMap((n) => JSON.parse(readAt(`data/${n}-prereg.json`)).claims.map((c) => c.claim));
  return lines.concat(claims);
}

export const shaOf = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/team1-corpus.mjs');
if (isMain) {
  const c = corpus();
  const real = realText((p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
  console.log(JSON.stringify({ sha256: shaOf(c), planted: c.planted.length, clean: c.clean.length, claims: c.claims.length, nonclaims: c.nonclaims.length, realLines: real.length, realSha256: shaOf(real) }, null, 1));
}
