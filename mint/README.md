# mint-a-department — the sellable path

One painful process, turned into a tiny owned system on your own hardware, with a signed receipt that proves it
beats what you use now. If it doesn't beat your signed baseline, you don't pay.

This folder is the **agreement scaffolding** — how a job becomes a signed, measurable deal. The **engine** that grows
the system (teacher distillation → gated search → an owned model) is `fallforgemint` and `fallnode`. The **gate** that
decides "beats the baseline or not" is this repo's `src/experiment.mjs`, reused here by `src/baseline.mjs`.

## The path, end to end

1. **Intake** — you tell us the job, the data, the tool or process you use now, and the number it hits today.
   See [intake-form.md](intake-form.md). (`src/baseline.mjs` `agreement(intake, design)` turns this into a sealed test.)
2. **Baseline agreement** — we write down, before any work, the one fixed test the delivery will be judged against:
   the metric, your current level (the baseline), the smallest improvement that counts as a win, how much data the
   test needs, and the confidence bar. Both sides sign those exact bytes. See [baseline-agreement-terms.md](baseline-agreement-terms.md).
   The goalpost cannot move after signing — the delivery is judged against the signed test alone.
3. **Delivery** — the engine grows the system for the job. See [delivery-pack.md](delivery-pack.md).
4. **The verdict** — the delivery's measured result is run through the signed test (`outcome(agreement, delivery)`).
   It returns a re-runnable receipt and one of: **beats the baseline → the charge is due**, or **does not beat it →
   the charge is waived**. The decision never depends on the price.

## What's proven

`src/baseline.mjs` is sealed (`data/mint1-baseline-prereg.json`) and witness-gated, nothing baselined. Its receipt
(`data/mint1-baseline-run.json`) re-measures on a clean machine: the agreement locks a valid sealed test, the goalpost
cannot move, the charge is waived whenever the baseline is not beaten, every outcome is a re-derivable receipt, and the
price never touches the decision — measured over a 400-delivery battery.

## What needs Simon (decisions, not code)

- The **price** and the exact **money-back terms** wording — the kernel carries price as a placeholder and never reads
  it for the decision; the terms draft leaves `{PRICE}` / `{DEPOSIT}` / `{PAYMENT}` for you to set.
- The **payment flow** (Stripe deposit / Payment Link) — connected by Simon.
- Any **public use** of the intake form or terms, and collecting a client's data, is a NEEDS-SIMON action.

Credits: the Konomi architecture and the LIGHT language — Thomas Frumkin; GEP / behavioural ideas — Gary W. Floyd
(CC BY 4.0), where used. Supplier on buyer-facing pages: AI-Native Solutions.
