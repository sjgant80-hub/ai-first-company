# Delivery pack — how the system is grown

Once the baseline agreement is signed, the job is built by the estate's own engine. Nothing novel is invented at
run time; the client ends up owning a tiny system that runs on their hardware.

## The steps
1. **Teacher distils the job.** A capable teacher model is run ONCE, at build time, over the client's shared data for
   the job, to produce verified patterns — the decisions the job actually needs. (Record the teacher in the receipt;
   check its licence allows commercial use of its outputs.) This is `fallforgemint`.
2. **Gated search grows verified patterns.** Candidate patterns are kept only when they pass a gate on held-out data —
   the same discipline as everything else here: a pattern earns its place by beating a baseline, measured, not asserted.
3. **A signed receipt vs the baseline.** The grown system is measured on the agreed test data and its result is run
   through the signed agreement (`src/baseline.mjs` `outcome`). The receipt says, re-runnably, whether it beats the
   client's signed baseline.
4. **A tiny owned system on their hardware.** The result is a small, owned node — `fallnode` — that does the job at
   CPU cost, no per-call rent. Repeated decisions were distilled once at build time and run free after.

## Why it pays
The client's run-time cost trends toward electricity: most of the work is decided by verified patterns on a CPU, the
inference was paid once at build time, and what remains runs on hardware they already own. That is what makes the
"beats your baseline or you don't pay" guarantee safe to offer — delivering it costs almost nothing to run. (The
inference-cost case is the estate's standing thesis; see the memory `build-plan-spine`.)

## Pointers
- Engine: `fallforgemint` (teacher distillation + gated growth), `fallnode` (the owned node).
- The guarantee's gate: this repo's `src/baseline.mjs` → `src/experiment.mjs`.
- The honest limit: genuinely novel, open-ended reasoning always costs real inference. mint-a-department is for the
  repeated, structured, decidable work — which is where the cost and the money are.
