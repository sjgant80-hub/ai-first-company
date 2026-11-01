// cards.test.mjs — each bot's card, written from the roster and stamped with its SHA-256.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RULE_WORDS, kindsFor, card, stampOf } from '../src/cards.mjs';

const R = JSON.parse(readFileSync(new URL('../data/roster.json', import.meta.url), 'utf8'));
const SHA = 'c'.repeat(64);

test('kindsFor: kinds whose tool is on the list, and the special ones', () => {
  assert.deepEqual(kindsFor(R, 'reach'), ['task', 'handoff', 'receipt', 'post', 'decision', 'blocker', 'note']);
  assert.deepEqual(kindsFor(R, 'builder'), ['task', 'handoff', 'build', 'receipt', 'decision', 'blocker', 'note']);
  assert.deepEqual(kindsFor(R, 'kar').slice(-2), ['task with "to" (assign work)', 'decision with verdict pause (the kill switch)']);
  assert.deepEqual(kindsFor(R, 'auditor').slice(-2), ['decision with verdict pause (the kill switch)', 'a verdict: PASS, FLAG or FAIL, with evidence']);
  assert.deepEqual(kindsFor(R, 'ghost'), []);
});

test('card: the whole card for a bot on Grok Bot\'s computer', () => {
  const md = card(R, 'card-keeper', SHA);
  assert.equal(md, [
    '# Card Keeper', '',
    '_Written from the roster (data/roster.json in the public repo ai-first-company, sha256 `' + SHA + '`) by tools/team-cards.mjs. Never edit this card by hand: change the roster and write the cards again._', '',
    '**Role.** Forges and verifies signed Fall Kards with fallkard-forge.', '',
    "**Runs on.** Grok Bot's computer · model grok, config card-keeper", '',
    '## May use', '',
    '- `feed.read` — read the shared feed', '- `feed.write` — add a line to the shared feed (through the writer)', '- `repo.read` — read code and receipts in the company\'s repos',
    '- `card.forge` — forge a Fall Kard with fallkard-forge', '- `card.verify` — verify a Fall Kard', "- `card.sign` — sign a Fall Kard · only with the auditor's PASS", '',
    '## Never', '', '- `post.publish` — publish a post', '- `money.spend` — spend or move money', '- `main.merge` — merge or push to main', '- anything not on your list: that is a FLAG (law 4)', '',
    '## What you write', '', '- Plain words a buyer understands. No in-house jargon.', '',
    '## Owns', '', '- forged cards', '- card verification records', '',
    '## The feed', '',
    '- One line per action, through the writer: `node tools/team.mjs add --agent card-keeper --kind <kind> --what "…" --link "<receipt>"`',
    '- Your kinds: task · handoff · receipt · decision · blocker · note',
    '- A "done" needs a link to its receipt. Anything public, paid or risky: add `--needs-owner` and wait for Simon.',
    '- Hand work on with a handoff line naming the next bot (`--kind handoff --to <bot>`).',
    '- The ten laws are in RULES.md, under THE BOT TEAM. The auditor checks your lines against this card.', '',
    "## From Grok Bot's computer", '',
    '- Clone the public repo ai-first-company once. Point `KAR_CONTINUITY` at your clone of this repo. Run the writer there and add `--push`: it commits and pushes the feed file alone.',
    '- A blocked login, a CAPTCHA or a "verify your account" screen: write a blocker line with `--needs-owner`. Never work around it (law 9).',
    "- Keep your own box feed if it helps you, but the team reads only this repo's feed.", '',
  ].join('\n'));
});

test('card: conditions, content rules, who is off the box', () => {
  const b = card(R, 'builder', SHA);
  assert.ok(b.includes("- `main.merge` — merge or push to main · only with the auditor's PASS and Simon's go"));
  assert.ok(b.includes('- `seal.write` — commit sealed claims before the code\n'));
  assert.ok(!b.includes("Grok Bot's computer"));
  const m = card(R, 'money-time', SHA);
  assert.ok(m.includes("- `listing.submit` — submit a listing to a marketplace · only with Simon's go"));
  assert.ok(m.includes('- ' + RULE_WORDS['no-earnings-claims']) && m.includes('- ' + RULE_WORDS['no-crypto-wording']));
  for (const id of ['reach', 'scout']) assert.ok(card(R, id, SHA).includes("## From Grok Bot's computer"), id);
  for (const id of ['kar', 'client-lead', 'auditor']) assert.ok(!card(R, id, SHA).includes("## From Grok Bot's computer"), id);
  const bare = { tools: { 'feed.read': { class: 'read', what: 'r' } }, personas: [{ id: 'kar', name: 'K', role: 'r', runs_on: 'x', tools: ['feed.read', { tool: 'ghost' }], forbidden: ['nope'], owns: ['o'], content: ['other-rule'] }] };
  const k = card(bare, 'kar', SHA);
  assert.ok(k.includes('model , config '), 'no runtime: empty, never a throw');
  assert.ok(k.includes('- `ghost` — \n') && k.includes('- `nope` — \n'));
  assert.ok(k.includes('## What you write\n\n- other-rule\n'));
  const none = card({ ...bare, personas: [{ ...bare.personas[0], content: [], tools: 'x', forbidden: 'y', owns: 'z' }] }, 'kar', SHA);
  assert.ok(!none.includes('## What you write') && none.includes('## May use\n\n\n## Never\n\n- anything not on your list'));
  assert.equal(card({ ...bare, tools: [] }, 'kar', SHA).includes('- `feed.read` — \n'), true);
});

test('card: nothing for an unknown bot or a bad stamp; stampOf reads it back', () => {
  assert.equal(card(R, 'ghost', SHA), '');
  assert.equal(card(R, 'kar', 'C'.repeat(64)), '');
  assert.equal(card(R, 'kar', 5), '');
  assert.equal(card(null, 'kar', SHA), '');
  assert.equal(card({ personas: [null] }, 'kar', SHA), '');
  assert.equal(stampOf(card(R, 'scout', SHA)), SHA);
  assert.equal(stampOf('no stamp'), '');
  assert.equal(stampOf(7), '');
});
