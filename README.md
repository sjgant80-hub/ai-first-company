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

## Live today vs waiting

- Live: the conductor, the claim gate, the voice's queue (nothing posted), the dashboard on a rehearsal cycle.
- Waiting for Simon: authorising the X connector with his own keys (dry run until then); approving each post or reply in his
  own words; creating the Grok Bot routine from `data/grok-routine.example.txt` with his own handle and inbox repo.
- Waiting for X: an AI reply bot beyond answering people who summon us needs X's prior written approval — not built.

Supplied by AI Native Solutions — https://www.ai-nativesolutions.com. MIT. SYMB-FER is SYMBEYOND AI LLC's protocol
(SYMB-FER, SYMBEYOND AI LLC, 2026). Powered by the Konomi architecture, created by Thomas Frumkin.
