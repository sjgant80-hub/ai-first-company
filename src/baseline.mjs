// baseline.mjs — mint-a-department's baseline agreement: a fixed, sealed test both parties sign BEFORE work, the
// delivery judged against that signed test alone, the charge waived whenever the delivery does not beat the signed
// baseline. Pure, total, deterministic, witness-gated; it decides and signs nothing, and no price touches the decision.
// It REUSES the gated-experiment engine — the baseline agreement IS a sealed test, and "beats the baseline" IS
// verdict(agreement.test, delivery) === PROMOTE. (Simon's BUILD-TOMORROW plan, PRIORITY 3. Sealed: data/mint1-baseline-prereg.json.)
//
//   agreement(intake, design) → { ok, agreement } | { ok:false, why } — build + validate the sealed baseline agreement
//   signable(agreement)       → the canonical bytes both parties sign BEFORE work (test + parties + clause + price; never a delivery)
//   outcome(agreement, delivery) → { ok, beatsBaseline, decision, charge: 'due'|'waived', receipt, why } | { ok:false, why }
import { normalizeTest, verdict, receiptOf, PROMOTE } from './experiment.mjs';
import { canonical } from './journal.mjs';

export const MONEY_BACK = 'beats the signed baseline or no charge';
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (s) => typeof s === 'string' && s.length > 0;

export function agreement(intake, design) {
  try {
    if (!isObj(intake)) return { ok: false, why: 'an intake is an object' };
    if (!isObj(design)) return { ok: false, why: 'a design is an object' };
    const { job, data, currentTool, client, supplier, metric, kind, baseline, direction } = intake;
    const { minImprovement, minSample, zCrit, alpha, price } = design;
    if (!str(job)) return { ok: false, why: 'intake.job' };
    if (!str(client)) return { ok: false, why: 'intake.client' };
    if (!str(supplier)) return { ok: false, why: 'intake.supplier' };
    // the metric/kind/baseline/direction and the design fields are validated by normalizeTest, wrapped for mint
    const t = normalizeTest({ id: 'mint:' + job, channel: 'client:' + client, technique: 'delivery:' + job, metric, kind, baseline, direction, minImprovement, minSample, alpha: alpha === undefined ? 0.05 : alpha, zCrit });
    if (!t.ok) return { ok: false, why: 'the sealed test: ' + t.why };
    return { ok: true, agreement: { test: t.test, parties: { client, supplier }, job, data: str(data) ? data : null, currentTool: str(currentTool) ? currentTool : null, moneyBack: MONEY_BACK, price: price === undefined ? null : price } };
  } catch { return { ok: false, why: 'the intake could not be read' }; }
}

// the bytes both parties sign BEFORE work: the fixed test, the parties, the clause and the price — never a delivery
export function signable(agr) {
  if (!isObj(agr) || !isObj(agr.test)) return '';
  return canonical({ test: agr.test, parties: agr.parties, job: agr.job, moneyBack: agr.moneyBack, price: agr.price });
}

export function outcome(agr, delivery) {
  if (!isObj(agr) || !isObj(agr.test)) return { ok: false, why: 'an agreement with a sealed test' };
  const v = verdict(agr.test, delivery);                 // judged ONLY against the agreement's sealed test — the goalpost cannot move
  if (v.ok === false) return { ok: false, why: 'the delivery: ' + v.why };
  const beatsBaseline = v.decision === PROMOTE;
  return { ok: true, beatsBaseline, decision: v.decision, charge: beatsBaseline ? 'due' : 'waived', receipt: receiptOf(agr.test, delivery, v), why: v.why };
}
