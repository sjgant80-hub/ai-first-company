// cards.mjs — each bot's card, written from the roster and stamped with the roster's SHA-256, so a card can never say
// something the roster does not. Pure, total, deterministic, witness-gated. (Simon's bot-team spec 2026-11-01, §1.)
//
//   kindsFor(roster, id)       → the feed kinds this persona may write (each kind's tool is on its list)
//   card(roster, id, sha)      → the card's markdown, or '' for an unknown persona or a sha that is not one
//   stampOf(md)                → the roster SHA-256 a card was written from, or ''
import { KINDS } from './feed.mjs';
import { may, toolOf } from './roster.mjs';

export const RULE_WORDS = Object.freeze({
  'no-earnings-claims': 'Never say what someone will earn, make or save, unless a receipt shows that number for them.',
  'no-crypto-wording': 'No crypto wording: no coins, no tokens as money, no NFTs, no airdrops, no web3.',
  'plain-language': 'Plain words a buyer understands. No in-house jargon.',
});
const OFF_BOX = Object.freeze(['money-time', 'reach', 'card-keeper', 'scout']);
const SHA = /^[0-9a-f]{64}$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const find = (r, id) => (isObj(r) && Array.isArray(r.personas) ? r.personas.find((p) => isObj(p) && p.id === id) : undefined);
const nameOf = (t) => (typeof t === 'string' ? t : isObj(t) ? t.tool : '');
const what = (r, t) => (isObj(r.tools) && isObj(r.tools[t]) ? r.tools[t].what : '');
const list = (v) => (Array.isArray(v) ? v : []);

export function kindsFor(roster, id) {
  const out = KINDS.filter((kind) => may(roster, id, toolOf({ kind }), {}).ok);
  if (may(roster, id, 'task.assign', {}).ok) out.push('task with "to" (assign work)');
  if (may(roster, id, 'pause.write', {}).ok) out.push('decision with verdict pause (the kill switch)');
  if (may(roster, id, 'verdict.write', {}).ok) out.push('a verdict: PASS, FLAG or FAIL, with evidence');
  return out;
}

const cond = (when) => (when.includes('auditor-pass') && when.includes('simon-go') ? " · only with the auditor's PASS and Simon's go" : when.includes('simon-go') ? " · only with Simon's go" : when.includes('auditor-pass') ? " · only with the auditor's PASS" : '');

export function card(roster, id, sha) {
  const p = find(roster, id);
  if (!p || typeof sha !== 'string' || !SHA.test(sha)) return '';
  const L = [`# ${p.name}`, '', `_Written from the roster (data/roster.json in the public repo ai-first-company, sha256 \`${sha}\`) by tools/team-cards.mjs. Never edit this card by hand: change the roster and write the cards again._`, ''];
  L.push(`**Role.** ${p.role}`, '', `**Runs on.** ${p.runs_on} · model ${isObj(p.runtime) ? p.runtime.model : ''}, config ${isObj(p.runtime) ? p.runtime.config : ''}`, '');
  L.push('## May use', '', ...list(p.tools).map((t) => `- \`${nameOf(t)}\` — ${what(roster, nameOf(t))}${cond(list(isObj(t) ? t.when : []))}`), '');
  L.push('## Never', '', ...list(p.forbidden).map((t) => `- \`${t}\` — ${what(roster, t)}`), '- anything not on your list: that is a FLAG (law 4)', '');
  if (list(p.content).length) L.push('## What you write', '', ...list(p.content).map((c) => `- ${RULE_WORDS[c] || c}`), '');
  L.push('## Owns', '', ...list(p.owns).map((o) => `- ${o}`), '');
  L.push('## The feed', '', `- One line per action, through the writer: \`node tools/team.mjs add --agent ${p.id} --kind <kind> --what "…" --link "<receipt>"\``);
  L.push(`- Your kinds: ${kindsFor(roster, id).join(' · ')}`);
  L.push('- A "done" needs a link to its receipt. Anything public, paid or risky: add `--needs-owner` and wait for Simon.');
  L.push('- Hand work on with a handoff line naming the next bot (`--kind handoff --to <bot>`).');
  L.push('- The ten laws are in RULES.md, under THE BOT TEAM. The auditor checks your lines against this card.', '');
  if (OFF_BOX.includes(p.id)) {
    L.push("## From Grok Bot's computer", '');
    L.push('- Clone the public repo ai-first-company once. Point `KAR_CONTINUITY` at your clone of this repo. Run the writer there and add `--push`: it commits and pushes the feed file alone.');
    L.push('- A blocked login, a CAPTCHA or a "verify your account" screen: write a blocker line with `--needs-owner`. Never work around it (law 9).');
    L.push('- Keep your own box feed if it helps you, but the team reads only this repo\'s feed.', '');
  }
  return L.join('\n');
}

export function stampOf(md) {
  const m = /sha256 `([0-9a-f]{64})`/.exec(typeof md === 'string' ? md : '');
  return m ? m[1] : '';
}

export default { RULE_WORDS, kindsFor, card, stampOf };
