// costcase.mjs — the hours the loop takes off a person, at the UK median hourly wage. Pure, total, deterministic.
// The wage is ONS ASHE 2025's median hourly pay (vendored, sourced: vendor/sovereign-enterprise/data/basis.json); the
// hours are the reader's own (the defaults are an example to move). Employer on-costs are left out, so it is a floor.
//
//   costCase({ hours, wage, weeks, asksPerCycle, cyclesPerWeek }) → { ok, hoursPerWeek, hoursPerYear, costPerYear,
//                                                                     approvalsPerWeek } | { ok: false, why }

export const DEFAULT_HOURS = Object.freeze({
  content: Object.freeze({ label: 'Drafting posts from proofs', hours: 3 }),
  watching: Object.freeze({ label: 'Watching X for mentions and leads', hours: 5 }),
  qualifying: Object.freeze({ label: 'Qualifying and answering leads', hours: 4 }),
  offers: Object.freeze({ label: 'Preparing offers and closes', hours: 2 }),
  delivery: Object.freeze({ label: 'Delivery admin and records', hours: 3 }),
});
const ok = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0;

export function costCase(input) {
  try {
    const { hours, wage, weeks = 52, asksPerCycle = 6, cyclesPerWeek = 5 } = input || {};
    if (hours === null || typeof hours !== 'object') return { ok: false, why: 'hours per job' };
    const per = Object.keys(DEFAULT_HOURS).map((k) => hours[k]);
    if (!per.every(ok) || per.some((h) => h > 168)) return { ok: false, why: 'hours per job: 0 to 168 a week each' };
    if (!ok(wage) || !ok(weeks) || weeks > 53 || !ok(asksPerCycle) || !ok(cyclesPerWeek)) return { ok: false, why: 'wage, weeks and the cycle rate are numbers' };
    const hoursPerWeek = per.reduce((a, b) => a + b, 0);
    const hoursPerYear = Math.round(hoursPerWeek * weeks * 10) / 10;
    return { ok: true, hoursPerWeek, hoursPerYear, costPerYear: Math.round(hoursPerYear * wage * 100) / 100, approvalsPerWeek: asksPerCycle * cyclesPerWeek };
  } catch { return { ok: false, why: 'the inputs could not be read' }; }
}

// What a team pays now for the seats this loop does without, a year, from the vendored basis (each price with its source).
//   seatsNow(basis, { crm, copilot }) → { ok, lines: [{ key, product, perMonth, seats, perYear, source }], perYear } | { ok: false, why }
export const SEATS = Object.freeze(['crm', 'copilot']);
export function seatsNow(basis, seats) {
  try {
    if (basis === null || typeof basis !== 'object' || seats === null || typeof seats !== 'object') return { ok: false, why: 'a basis and seat counts' };
    const lines = [];
    for (const k of SEATS) {
      const b = basis['seat.' + k], n = seats[k];
      if (b === null || typeof b !== 'object' || !ok(b.value) || !Number.isInteger(n) || n < 0) return { ok: false, why: 'seat.' + k + ': a sourced price and a whole number of seats' };
      lines.push({ key: k, product: b.product, perMonth: b.value, seats: n, perYear: Math.round(b.value * 12 * n * 100) / 100, source: b.source });
    }
    return { ok: true, lines, perYear: Math.round(lines.reduce((a, l) => a + l.perYear, 0) * 100) / 100 };
  } catch { return { ok: false, why: 'the basis could not be read' }; }
}

export default { DEFAULT_HOURS, costCase, SEATS, seatsNow };
