// costcase.test.mjs — hours × the median wage, a floor; bad inputs refused, never thrown.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costCase, DEFAULT_HOURS } from '../src/costcase.mjs';

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
