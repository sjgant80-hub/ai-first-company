# Baseline agreement + money-back terms — DRAFT

A plain-English template. The bracketed `{…}` fields are **Simon's to set** (price, deposit, payment); everything else
is fixed by the signed test. This is a draft for review, not for public use until Simon approves it.

---

**Between:** {CLIENT} ("the client") and AI-Native Solutions ("the supplier").
**The job:** {JOB}.

## 1. The sealed test (signed before any work)
Both sides sign these exact values before work begins. They do not change afterwards — the delivery is judged
against this test alone.

- **Metric:** {METRIC}
- **Kind:** {rate | mean}
- **The client's baseline (today's level):** {BASELINE}
- **Better means:** {higher | lower}
- **Smallest improvement that counts as a win:** {MIN_IMPROVEMENT}
- **Data the test runs on (per side):** at least {MIN_SAMPLE}
- **Confidence bar (critical value):** {Z_CRIT} — the standardized result must clear this, so a win is real, not noise.

These are exactly the fields `src/baseline.mjs` `agreement(intake, design)` locks, and the bytes both parties sign are
`signable(agreement)` — the test, the parties, this clause and the price, and **never** any result.

## 2. What we deliver
A tiny system that does {JOB} on the client's own hardware, grown by teacher distillation and gated search (see
[delivery-pack.md](delivery-pack.md)), plus a signed receipt of its measured result on the agreed data.

## 3. The guarantee — beats your signed baseline or you don't pay
When the delivery is measured, its result is run through the signed test (`outcome(agreement, delivery)`):
- **If it beats the signed baseline** (clears the improvement and the confidence bar, in the agreed direction) — the
  charge of **{PRICE}** is due.
- **If it does not** — the charge is **waived**. You pay nothing for the build.

The decision is a re-runnable receipt (a SHA-256 of the signed test, the measured result and the verdict); either side
can re-run it. The price never affects the decision.

## 4. Payment  *(Simon to set)*
- **Price:** {PRICE}
- **Deposit (refundable if the baseline is not beaten):** {DEPOSIT}
- **How paid:** {PAYMENT — e.g. Stripe Payment Link}

## 5. Data and scope
We use only the data the client shares for the test, for this job, and return or delete it on request. The system runs
on the client's hardware. Anything that significantly affects a person stays a human decision.

---
*Credits: Konomi architecture / LIGHT — Thomas Frumkin; GEP — Gary W. Floyd (CC BY 4.0), where used.*
