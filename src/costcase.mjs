// costcase.mjs — the hours the loop takes off a person, at the UK median hourly wage. Pure, total, deterministic.
// The wage is ONS ASHE 2025's median hourly pay (vendored, sourced: vendor/sovereign-enterprise/data/basis.json); the
// hours are the reader's own (the defaults are an example to move). Employer on-costs are left out, so it is a floor.
// Below it: the sourced seat prices a team pays now, what the loop costs to run in electricity, and all three over years.
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

// What it costs to run, a year, on a machine you already have: the extra electricity of an always-on draw. The price is
// the vendored basis's (DESNZ non-domestic, incl. Climate Change Levy); the default draw is the basis's chip base power
// (Intel's published spec) and the default hours are always on. The watts and the hours are the reader's own.
//   runningCost(basis, { watts, hoursOn }) → { ok, watts, hoursOn, kwhPerYear, perYear, pencePerKwh, source } | { ok: false, why }
const isFig = (b) => b !== null && typeof b === 'object' && ok(b.value);
export function runningCost(basis, input) {
  try {
    if (basis === null || typeof basis !== 'object') return { ok: false, why: 'a basis' };
    const e = basis.electricityPencePerKwh, w = basis.laptopExtraWatts, h = basis.hoursPerYear;
    if (!isFig(e) || !isFig(w) || !isFig(h)) return { ok: false, why: 'the basis: an electricity price, a draw in watts and the hours in a year' };
    const { watts = w.value, hoursOn = h.value } = input || {};
    if (!ok(watts) || watts > 2000) return { ok: false, why: 'watts: 0 to 2000' };
    if (!ok(hoursOn) || hoursOn > 8784) return { ok: false, why: 'hours on: 0 to 8784 a year' };
    const kwhPerYear = Math.round(watts * hoursOn / 10) / 100;
    return { ok: true, watts, hoursOn, kwhPerYear, perYear: Math.round(kwhPerYear * e.value) / 100, pencePerKwh: e.value, source: e.source };
  } catch { return { ok: false, why: 'the basis could not be read' }; }
}

// A yearly cost carried over `years`, rising by a yearly rate (the basis's CPI) every year after the first. Integer
// steps, no powers, so every number re-computes by hand.
//   overYears(perYear, rate, years) → { ok, total } | { ok: false, why }
export function overYears(perYear, rate, years) {
  if (!ok(perYear) || !ok(rate) || rate > 1) return { ok: false, why: 'a yearly cost and a yearly rate from 0 to 1' };
  if (!Number.isInteger(years) || years < 1 || years > 10) return { ok: false, why: 'years: a whole number from 1 to 10' };
  let total = 0, factor = 1;
  for (let y = 0; y < years; y++) { total += perYear * factor; factor *= 1 + rate; }
  return { ok: true, total: Math.round(total * 100) / 100 };
}

// The board's view over years: the time the loop takes on (hours × wage), the seats it does without (sourced list
// prices) and the electricity it uses, each rising by the basis's CPI every year after the first (the basis applies
// CPI to pay, seats and electricity alike). Nothing else is in it: no price of ours, and none of the owner's existing
// subscriptions (Grok, Claude) or X's own per-post charge, which are not in the sourced basis.
//   yearsCase(basis, { hours, wage, seats: { crm, copilot }, watts, hoursOn, years = 3 }) →
//     { ok, years, cpi, perYear: { time, seats, power }, over: { time, seats, power }, net } | { ok: false, why }
export function yearsCase(basis, input) {
  try {
    const i = input || {};
    const c = costCase({ hours: i.hours, wage: i.wage });
    if (!c.ok) return c;
    const s = seatsNow(basis, i.seats);
    if (!s.ok) return s;
    const p = runningCost(basis, { watts: i.watts, hoursOn: i.hoursOn });
    if (!p.ok) return p;
    if (!isFig(basis.cpi)) return { ok: false, why: 'the basis: a CPI rate' };
    const cpi = basis.cpi.value, years = i.years === undefined ? 3 : i.years;
    const perYear = { time: c.costPerYear, seats: s.perYear, power: p.perYear };
    const over = {};
    for (const k of Object.keys(perYear)) {
      const o = overYears(perYear[k], cpi, years);
      if (!o.ok) return o;
      over[k] = o.total;
    }
    return { ok: true, years, cpi, perYear, over, net: Math.round((over.time + over.seats - over.power) * 100) / 100 };
  } catch { return { ok: false, why: 'the inputs could not be read' }; }
}

export default { DEFAULT_HOURS, costCase, SEATS, seatsNow, runningCost, overYears, yearsCase };
