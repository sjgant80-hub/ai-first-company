#!/usr/bin/env node
// check-fence — may this bot use this tool now? Answered by the roster's fence (src/roster.mjs may()).
import { readFileSync } from 'node:fs';
import { may } from '../../../src/roster.mjs';

const [bot, tool] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const ctx = { auditorPass: process.argv.includes('--pass'), simonGo: process.argv.includes('--go') };
const roster = JSON.parse(readFileSync(new URL('../../../data/roster.json', import.meta.url), 'utf8'));
const r = may(roster, bot, tool, ctx);
console.log(JSON.stringify({ bot, tool, ...ctx, ...r }));
process.exit(r.ok ? 0 : 1);
