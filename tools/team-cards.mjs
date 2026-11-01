#!/usr/bin/env node
// team-cards.mjs — write each bot's card into the team's private shared repo (team/<id>.md) from data/roster.json, or
// check that the cards there are still the roster's. The repo is named only in local config (~/.team-feed/config.json
// { repo }, or KAR_CONTINUITY), never here.
//   node tools/team-cards.mjs           write the eight cards
//   node tools/team-cards.mjs --check   every card equals the roster's card, byte for byte (exit 1 if any is stale)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { PERSONAS } from '../src/feed.mjs';
import { card } from '../src/cards.mjs';

const cfg = () => { try { return JSON.parse(readFileSync(join(homedir(), '.team-feed', 'config.json'), 'utf8')).repo || ''; } catch { return ''; } };
export const REPO = process.env.KAR_CONTINUITY || cfg();
export const rosterText = () => readFileSync(new URL('../data/roster.json', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
export const shaOf = (t) => createHash('sha256').update(t).digest('hex');
export const cardsFor = (text) => { const r = JSON.parse(text), sha = shaOf(text); return Object.fromEntries(PERSONAS.map((id) => [id, card(r, id, sha)])); };

/** which cards in the shared repo differ from the roster's (missing ones count) */
export function stale(text = rosterText()) {
  const want = cardsFor(text);
  return PERSONAS.filter((id) => { const p = join(REPO, 'team', id + '.md'); return !existsSync(p) || readFileSync(p, 'utf8').replace(/\r\n/g, '\n') !== want[id]; });
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/team-cards.mjs');
if (isMain) {
  if (!REPO) { console.error('✗ no local config naming the shared repo'); process.exit(1); }
  if (process.argv[2] === '--check') { const s = stale(); console.log(s.length ? '✗ stale cards: ' + s.join(', ') : '✓ all 8 cards are the roster\'s'); process.exit(s.length ? 1 : 0); }
  const cards = cardsFor(rosterText());
  mkdirSync(join(REPO, 'team'), { recursive: true });
  for (const [id, md] of Object.entries(cards)) writeFileSync(join(REPO, 'team', id + '.md'), md);
  console.log('✓ wrote ' + Object.keys(cards).length + ' cards from roster ' + shaOf(rosterText()).slice(0, 12));
}
