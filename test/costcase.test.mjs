// costcase.test.mjs — hours × the median wage, a floor; bad inputs refused, never thrown.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costCase, DEFAULT_HOURS, seatsNow, SEATS, runningCost, overYears, yearsCase } from '../src/costcase.mjs';
import { readFileSync } from 'node:fs';

const BASIS = JSON.parse(readFileSync(new URL('../vendor/sovereign-enterprise/data/basis.json', import.meta.url), 'utf8'));

test('seatsNow: the sourced seat prices, a year', () => {
  assert.deepEqual([...SEATS], ['crm', 'copilot']);
  const r = seatsNow(BASIS, { crm: 3, copilot: 2 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.lines.map((l) => [l.key, l.perMonth, l.seats, l.perYear]), [['crm', 80, 3, 2880], ['copilot', 23.1, 2, 554.4]]);
  assert.equal(r.perYear, 3434.4);
  assert.equal(r.lines[0].product, 'Salesforce Pro Suite');
  assert.match(r.lines[1].source, /^https:\/\/www\.microsoft\.com\//);
  assert.equal(seatsNow(BASIS, { crm: 0, copilot: 0 }).perYear, 0);
  assert.equal(seatsNow({ 'seat.crm': { value: 1.005 }, 'seat.copilot': { value: 0 } }, { crm: 1, copilot: 1 }).lines[0].perYear, 12.06);
});

test('seatsNow refuses what it cannot price', () => {
  assert.deepEqual(seatsNow(null, { crm: 1, copilot: 1 }), { ok: false, why: 'a basis and seat counts' });
  assert.deepEqual(seatsNow(BASIS, null), { ok: false, why: 'a basis and seat counts' });
  assert.deepEqual(seatsNow(BASIS, { crm: 1.5, copilot: 1 }), { ok: false, why: 'seat.crm: a sourced price and a whole number of seats' });
  assert.deepEqual(seatsNow(BASIS, { crm: -1, copilot: 1 }), { ok: false, why: 'seat.crm: a sourced price and a whole number of seats' });
  assert.deepEqual(seatsNow(BASIS, { crm: 1 }), { ok: false, why: 'seat.copilot: a sourced price and a whole number of seats' });
  assert.deepEqual(seatsNow({ 'seat.crm': null }, { crm: 1, copilot: 1 }), { ok: false, why: 'seat.crm: a sourced price and a whole number of seats' });
  assert.deepEqual(seatsNow({ 'seat.crm': { value: -5 } }, { crm: 1, copilot: 1 }), { ok: false, why: 'seat.crm: a sourced price and a whole number of seats' });
  const evil = {}; Object.defineProperty(evil, 'seat.crm', { get() { throw new Error('x'); } });
  assert.deepEqual(seatsNow(evil, { crm: 1, copilot: 1 }), { ok: false, why: 'the basis could not be read' });
});

const H = Object.fromEntries(Object.entries(DEFAULT_HOURS).map(([k, v]) => [k, v.hours]));

test('the defaults: 17 hours a week, 52 weeks, at the median wage', () => {
  assert.deepEqual(Object.keys(DEFAULT_HOURS), ['content', 'watching', 'qualifying', 'offers', 'delivery']);
  assert.deepEqual(costCase({ hours: H, wage: 19.67 }), { ok: true, hoursPerWeek: 17, hoursPerYear: 884, costPerYear: 17388.28, approvalsPerWeek: 30 });
  assert.deepEqual(costCase({ hours: { ...H, content: 0.5 }, wage: 10, weeks: 1, asksPerCycle: 2, cyclesPerWeek: 3 }), { ok: true, hoursPerWeek: 14.5, hoursPerYear: 14.5, costPerYear: 145, approvalsPerWeek: 6 });
  assert.equal(costCase({ hours: { ...H, content: 0.33 }, wage: 1, weeks: 3 }).hoursPerYear, 43);
  assert.equal(costCase({ hours: { ...H, content: 0.31 }, wage: 1, weeks: 1 }).hoursPerYear, 14.3);
  assert.equal(costCase({ hours: { ...H, content: 168 }, wage: 1 }).ok, true);
  assert.equal(costCase({ hours: H, wage: 0, weeks: 53 }).ok, true);
});

test('bad inputs are refused with a reason', () => {
  assert.deepEqual(costCase(null), { ok: false, why: 'hours per job' });
  assert.deepEqual(costCase({ hours: null, wage: 1 }), { ok: false, why: 'hours per job' });
  assert.deepEqual(costCase({ hours: { ...H, content: -1 }, wage: 1 }), { ok: false, why: 'hours per job: 0 to 168 a week each' });
  assert.deepEqual(costCase({ hours: { ...H, content: 169 }, wage: 1 }), { ok: false, why: 'hours per job: 0 to 168 a week each' });
  assert.deepEqual(costCase({ hours: { ...H, delivery: '3' }, wage: 1 }), { ok: false, why: 'hours per job: 0 to 168 a week each' });
  assert.deepEqual(costCase({ hours: { ...H, offers: NaN }, wage: 1 }), { ok: false, why: 'hours per job: 0 to 168 a week each' });
  for (const bad of [{ wage: -1 }, { wage: '19' }, { weeks: 54 }, { weeks: -1 }, { asksPerCycle: -1 }, { cyclesPerWeek: Infinity }]) assert.deepEqual(costCase({ hours: H, wage: 19.67, ...bad }), { ok: false, why: 'wage, weeks and the cycle rate are numbers' });
  const evil = {}; Object.defineProperty(evil, 'hours', { get() { throw new Error('x'); } });
  assert.deepEqual(costCase(evil), { ok: false, why: 'the inputs could not be read' });
});

test('runningCost: the extra electricity of an always-on draw, from the sourced basis', () => {
  const r = runningCost(BASIS);
  assert.deepEqual(r, { ok: true, watts: 15, hoursOn: 8760, kwhPerYear: 131.4, perYear: 32.21, pencePerKwh: 24.51, source: BASIS.electricityPencePerKwh.source });
  assert.match(r.source, /^https:\/\/assets\.publishing\.service\.gov\.uk\//);
  assert.deepEqual(runningCost(BASIS, { watts: 60, hoursOn: 2000 }), { ...r, watts: 60, hoursOn: 2000, kwhPerYear: 120, perYear: 29.41 });
  assert.equal(runningCost(BASIS, { watts: 2000, hoursOn: 8784 }).ok, true);
  assert.equal(runningCost(BASIS, { watts: 0, hoursOn: 0 }).perYear, 0);
  assert.equal(runningCost(BASIS, { watts: 1, hoursOn: 5 }).kwhPerYear, 0.01);
});

test('runningCost refuses what it cannot price', () => {
  assert.deepEqual(runningCost(null), { ok: false, why: 'a basis' });
  assert.deepEqual(runningCost('basis'), { ok: false, why: 'a basis' });
  const want = { ok: false, why: 'the basis: an electricity price, a draw in watts and the hours in a year' };
  for (const k of ['electricityPencePerKwh', 'laptopExtraWatts', 'hoursPerYear']) {
    assert.deepEqual(runningCost({ ...BASIS, [k]: { value: 'x' } }), want, k);
    assert.deepEqual(runningCost({ ...BASIS, [k]: null }), want, k);
    assert.deepEqual(runningCost({ ...BASIS, [k]: 7 }), want, k);
    assert.deepEqual(runningCost({ ...BASIS, [k]: { value: -1 } }), want, k);
  }
  for (const watts of [-1, 2001, '15', NaN]) assert.deepEqual(runningCost(BASIS, { watts }), { ok: false, why: 'watts: 0 to 2000' });
  for (const hoursOn of [-1, 8785, '8760', Infinity]) assert.deepEqual(runningCost(BASIS, { hoursOn }), { ok: false, why: 'hours on: 0 to 8784 a year' });
  const evil = { ...BASIS }; Object.defineProperty(evil, 'electricityPencePerKwh', { get() { throw new Error('x'); } });
  assert.deepEqual(runningCost(evil), { ok: false, why: 'the basis could not be read' });
});

test('overYears: CPI on every year after the first, whole steps', () => {
  assert.deepEqual(overYears(100, 0.1, 1), { ok: true, total: 100 });
  assert.deepEqual(overYears(100, 0.1, 2), { ok: true, total: 210 });
  assert.deepEqual(overYears(100, 0.1, 3), { ok: true, total: 331 });
  assert.deepEqual(overYears(100, 0, 10), { ok: true, total: 1000 });
  assert.deepEqual(overYears(1, 1, 2), { ok: true, total: 3 });
  assert.deepEqual(overYears(0, 0.031, 3), { ok: true, total: 0 });
  assert.deepEqual(overYears(1000, 0.031, 3), { ok: true, total: 3093.96 });
  const rate = { ok: false, why: 'a yearly cost and a yearly rate from 0 to 1' };
  for (const [p, r] of [[-1, 0.1], ['1', 0.1], [NaN, 0.1], [1, -0.1], [1, 1.5], [1, '0.1'], [1, Infinity]]) assert.deepEqual(overYears(p, r, 3), rate, `${p} ${r}`);
  const yrs = { ok: false, why: 'years: a whole number from 1 to 10' };
  for (const y of [0, 11, 1.5, '3', -1, NaN, undefined]) assert.deepEqual(overYears(100, 0.1, y), yrs, String(y));
});

const SEATS3 = { crm: 3, copilot: 3 };
test('yearsCase: the time, the seats and the electricity over years, from the sourced basis', () => {
  const r = yearsCase(BASIS, { hours: H, wage: 19.67, seats: SEATS3 });
  assert.equal(r.ok, true);
  assert.equal(r.years, 3);
  assert.equal(r.cpi, 0.031);
  assert.deepEqual(r.perYear, { time: 17388.28, seats: 3711.6, power: 32.21 });
  assert.deepEqual(r.over, { time: overYears(17388.28, 0.031, 3).total, seats: overYears(3711.6, 0.031, 3).total, power: overYears(32.21, 0.031, 3).total });
  assert.equal(r.net, Math.round((r.over.time + r.over.seats - r.over.power) * 100) / 100);
  const one = yearsCase(BASIS, { hours: H, wage: 10, seats: { crm: 1, copilot: 0 }, watts: 0, years: 1 });
  assert.deepEqual(one, { ok: true, years: 1, cpi: 0.031, perYear: { time: 8840, seats: 960, power: 0 }, over: { time: 8840, seats: 960, power: 0 }, net: 9800 });
  assert.equal(yearsCase(BASIS, { hours: H, wage: 0, seats: { crm: 0, copilot: 0 }, watts: 100, years: 10 }).net < 0, true);
});

test('yearsCase refuses what it cannot compute, with the reason of the part that refused', () => {
  assert.deepEqual(yearsCase(BASIS, null), { ok: false, why: 'hours per job' });
  assert.deepEqual(yearsCase(BASIS, { hours: H, wage: -1, seats: SEATS3 }), { ok: false, why: 'wage, weeks and the cycle rate are numbers' });
  assert.deepEqual(yearsCase(BASIS, { hours: H, wage: 1, seats: { crm: 1 } }), { ok: false, why: 'seat.copilot: a sourced price and a whole number of seats' });
  assert.deepEqual(yearsCase(BASIS, { hours: H, wage: 1, seats: SEATS3, watts: 9999 }), { ok: false, why: 'watts: 0 to 2000' });
  assert.deepEqual(yearsCase({ ...BASIS, cpi: undefined }, { hours: H, wage: 1, seats: SEATS3 }), { ok: false, why: 'the basis: a CPI rate' });
  assert.deepEqual(yearsCase({ ...BASIS, cpi: { value: 2 } }, { hours: H, wage: 1, seats: SEATS3 }), { ok: false, why: 'a yearly cost and a yearly rate from 0 to 1' });
  assert.deepEqual(yearsCase(BASIS, { hours: H, wage: 1, seats: SEATS3, years: 0 }), { ok: false, why: 'years: a whole number from 1 to 10' });
  const evil = {}; Object.defineProperty(evil, 'hours', { get() { throw new Error('x'); } });
  assert.deepEqual(yearsCase(BASIS, evil), { ok: false, why: 'the inputs could not be read' });
});
