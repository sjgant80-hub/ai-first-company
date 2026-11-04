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

Plus `src/costcase.mjs` (53/53, the cost case, the seat comparison and the years view) and `src/page.mjs` (15/15). Seals: `data/step*-prereg.json`; receipts: `data/step*-run.json`
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

## The growth gate and the guarantee engine (2 and 3 November 2026)

One kernel answers two ways a company run by an AI can fool itself. On the page:
[the growth gate](https://sjgant80-hub.github.io/ai-first-company/#growth) (try it, and its sealed battery re-runs in your
browser) and [the guarantee engine](https://sjgant80-hub.github.io/ai-first-company/#guarantee) (the three real runs, one
re-derived in your browser from the pinned public dataset, and the worked example on the real kernel).

| What | Code | Sealed claims | Receipt |
|---|---|---|---|
| The growth gate: a technique becomes a versioned skill only when it beats the channel's sealed baseline (enough data in each arm, the sealed margin in the sealed direction, an effect at least the sealed critical value), whoever proposed it | `src/experiment.mjs` | 9 of 9 held (seal `6413751`, re-sealed `0b341b0` before any code) | `data/growth1-experiment-run.json` |
| The guarantee engine: one fixed test both sides sign before work; the delivery is judged against that test alone, and the charge is due only when it beats the signed baseline (the price never enters the decision) | `src/baseline.mjs` (reuses `src/experiment.mjs`) | 6 of 6 held (seal `1041ee6`) | `data/mint1-baseline-run.json` |
| Run 1, UCI Car, single-feature rules from a local teacher model | `src/distill.mjs`, `tools/mint-demo.mjs` | 1 of 2 held: did not beat the baseline, charge waived (kept) | `data/mint-demo-run.json` |
| Run 2, UCI Car, rules of up to three conditions | `src/distill.mjs`, `tools/mint-demo-v2.mjs` | 0 of 2 held: no rule survived the gate, charge waived (kept) | `data/mint-demo-v2-run.json` |
| Run 3, UCI Mushroom, single-feature rules | `src/distill.mjs`, `tools/mint-demo-v3.mjs` | 2 of 2 held: beat the baseline, charge due | `data/mint-demo-v3-run.json` |

Each run was sealed before it ran; the teacher's reply was recorded once, and CI re-derives every receipt from it (no
model call). The commercial side (the price, the money-back wording, the payment flow, and publishing the intake form
in `mint/`) is Simon's decision and is not on the page.

## The gate, for every kernel

Every kernel in `src/` has its own test file and is mutation-tested on GitHub's runner by witness, pinned to its v0.6
release, on every push; nothing is baselined. `test/site.test.mjs` fails the build if a kernel is added without being
gated, if the witness clone is unpinned, if any kernel or vendored module reaches the network, the disk, a child
process or the environment, or if any module imports from a package registry. The counts the page's blueprint shows are
read from a CI run's own log by `tools/kernel-witness.mjs` into `data/kernel-witness.json`, and the page checks in the
reader's browser that each file it serves hashes to the file that was gated.

The current receipt: CI run [41892773758](https://github.com/sjgant80-hub/ai-first-company/actions/runs/41892773758)
at `cc3a884`, 19 kernels, 782 of 782 mutants caught, 0 survived, nothing baselined (the growth gate `experiment`
82/82, the guarantee's `baseline` 13/13 and `distill` 33/33).

## Live today vs waiting

- Live: the conductor, the claim gate, the voice's queue (nothing posted), the dashboard on a rehearsal cycle, the bot
  team's fence and auditor, the growth gate and the guarantee engine (each runs its real kernel in the reader's browser).
- Waiting for Simon: authorising the X connector with his own keys (dry run until then); approving each post or reply in his
  own words; creating the Grok Bot routine from `data/grok-routine.example.txt` with his own handle and inbox repo.
  For the guarantee: the price, the exact money-back wording, the payment flow, and any public use of the intake form
  and terms or collection of a client's data. For the bot team: his own signing key, a cloud schedule for the night run,
  the consent list, and keys per role for the bots that run on Grok Bot's computer.
- Waiting for X: an AI reply bot beyond answering people who summon us needs X's prior written approval — not built.

Supplied by AI Native Solutions — https://www.ai-nativesolutions.com. MIT. SYMB-FER is SYMBEYOND AI LLC's protocol
(SYMB-FER, SYMBEYOND AI LLC, 2026). Powered by the Konomi architecture, created by Thomas Frumkin.
