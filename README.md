# AI-First Company

**▶ Live: https://sjgant80-hub.github.io/ai-first-company/** — the company's dashboard, the conductor you can try, how it
works, the blueprint, every receipt, and the case for your business.

A company the AI runs and a person oversees. Kar (the estate's resident AI builder) finds the market, drafts, qualifies,
delivers and records; Grok Bot reads X for it on the owner's own account; **nothing leaves the company without the owner's
approval of its exact words**, and **every public claim is checked against a committed receipt**.

## The seven organs, each sealed before it was measured

| Step | Organ | Code | Mutation gate | Sealed claims |
|---|---|---|---|---|
| 1 | Conductor (kar-mind's controller, unchanged, + Grok Bot's and Simon's lanes) | `src/conductor.mjs` | witness 29/29 → 32/32 | 5 of 7 (C6, C7 failed and kept) |
| 1b | Conductor, fail-closed | `src/conductor.mjs` | 32/32 | 1 of 3 (B2, B3 failed and kept) |
| 2 | The voice + claim gate (in [kar-voice](https://github.com/sjgant80-hub/kar-voice)) | `claim-gate.mjs` | 47/47 | 5 of 6 (V3 failed and kept) |
| 3 | Reach: Grok Bot's routine brief and the signal reader | `src/brief.mjs`, `src/reach.mjs` | 16/16, 27/27 | 3 of 5 (R2, R5 failed and kept; R4 held on kar-passport's token) |
| 4 | Funnel + the journal | `src/funnel.mjs`, `src/journal.mjs` | 35/35, 18/18 | 5 of 5 |
| 5 | Operations | `src/ops.mjs` | 31/31 | 5 of 5 |
| 6 | Oversight | `src/oversight.mjs` | 39/39 | 4 of 4 |
| 7 | The loop, closed | `src/cycle.mjs` | 26/26 | 6 of 6 |

Plus `src/costcase.mjs` (29/29, the cost case and the seat comparison) and `src/page.mjs` (15/15). Seals: `data/step*-prereg.json`; receipts: `data/step*-run.json`
and `data/cycle-run.json`; every tool `tools/step*-measure.mjs --check | --verify`. CI re-measures every seal and receipt and
mutation-tests every kernel on each push (`.github/workflows/gate.yml`).

## The bot team (Simon's spec, 1 November 2026)

The company runs as eight bots, one role each (Kar the conductor, Builder, Money time, Reach, Scout, Client lead, Card
Keeper, and a separate Auditor), writing to one shared feed. Anything public, paid or risky waits for Simon's signed go.
The feed, the persona cards and the team law live in the team's private shared repo; the code that checks them is here.
On the page: [the bot team](https://sjgant80-hub.github.io/ai-first-company/#team) (its cards, a live fence and a live
auditor, and every receipt).

| Step | What | Code | Mutation gate (witness v0.6) | Sealed claims |
|---|---|---|---|---|
| 1 | One shared feed (redacts keys, tokens, emails, card numbers; flags a done with no receipt; a key per bot; the kill switch) + Kar's rollup + the ten laws mapped to their checks | `src/feed.mjs`, `src/rollup.mjs`, `data/team-law.json` | 137/137, 38/38 | 9 of 10 (F3b failed and kept) |
| 2 | The eight roles as a fence: `may(bot, tool, { auditorPass, simonGo })`, and each bot's card written from the roster | `data/roster.json`, `src/roster.mjs`, `src/cards.mjs` | 72/72, 15/15 | 5 of 6 (P5 failed and kept) |
| 2b | P5's fix (the fuzz found 36 throws the gate missed) | `src/roster.mjs` | 72/72 | 4 of 4 |
| 3 | The auditor: receipts re-hashed and read, the seal before the code, `--verify` re-run on a clean copy, every tool through the fence (only signed PASSes and signed go's count), the words of anything going out; a local model may only add flags | `src/auditor.mjs`, `tools/audit.mjs` | 73/73 | 6 of 7 (T2c failed on its count check and kept: 29 posts written, not 30; on them 29/29 caught, 5/30 honest stopped) |
| 4 | The existing bots wired in: Kar's rollup on top of AGENT_FEED.md, the Builder's lines pinned to their receipts (`--receipt-file`), the auditor judging each new line once, Grok Bot's path tried from a fresh clone | `tools/team.mjs`, `tools/audit.mjs` | (kernels above) | 4 of 4 (on Kar's machine; the feed is private) |
| 5 | Scout, Reach and Client lead: their cards and fences came with step 2 and were tested in step 3; Client lead's key made here. Scout and Reach make theirs on Grok Bot's computer | — | — | no new code, nothing to seal |
| 6 | The skill library: a folder per skill (SKILL.md, script, tests, sample receipt), owner and callers, pinned by hash; a changed skill is unusable until the auditor passes it again; one index (`skills/catalog.json`, `skills/llms.txt`) | `src/skills.mjs`, `tools/skills.mjs`, `skills/` | 27/27 | 6 of 6 |

Tools: `tools/team.mjs` (write a line, pause, roll up, verify, make a key, Simon's signed decision), `tools/audit.mjs`
(the auditor's own process), `tools/team-cards.mjs` (the cards), `tools/skills.mjs` (the skill library). Seals `data/team*-prereg.json`, receipts
`data/team*-run.json`, witness results `data/team-witness.json`; CI re-measures every receipt and re-gates every kernel.

## Live today vs waiting

- Live: the conductor, the claim gate, the voice's queue (nothing posted), the dashboard on a rehearsal cycle.
- Waiting for Simon: authorising the X connector with his own keys (dry run until then); approving each post or reply in his
  own words; creating the Grok Bot routine from `data/grok-routine.example.txt` with his own handle and inbox repo.
- Waiting for X: an AI reply bot beyond answering people who summon us needs X's prior written approval — not built.

Supplied by AI Native Solutions — https://www.ai-nativesolutions.com. MIT. SYMB-FER is SYMBEYOND AI LLC's protocol
(SYMB-FER, SYMBEYOND AI LLC, 2026). Powered by the Konomi architecture, created by Thomas Frumkin.
