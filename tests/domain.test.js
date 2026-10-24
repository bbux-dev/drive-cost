import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, freshState, electricityRate, estimate, latestGasPrice, localDate, parseDate, rangeUsed, splitDistance } from '../site/domain.js';

const settings = { ...DEFAULT_SETTINGS, gasPrice: 4.5 };
const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test('a mixed drive prices electric and gas separately without rounding intermediate values', () => {
  const result = estimate(25, 50, settings, '2026-10-24');
  assert.equal(result.kwh, 8);
  closeTo(result.gallons, 50 / 46);
  closeTo(result.electricCost, 1.028);
  closeTo(result.total, 1.028 + 50 / 46 * 4.5);
});

test('gas price is optional for electric-only trips, but required for gas miles', () => {
  closeTo(estimate(5, 0, DEFAULT_SETTINGS, '2026-10-24').total, 0.2056);
  const incomplete = estimate(25, 50, DEFAULT_SETTINGS, '2026-10-24');
  assert.equal(incomplete.total, null);
  assert.equal(incomplete.needsGasPrice, true);
});

test('SMUD 8 p.m. rate changes at summer boundaries and weekends', () => {
  assert.equal(electricityRate('2026-05-29').rate, 0.1285);
  assert.equal(electricityRate('2026-06-01').rate, 0.2139);
  assert.equal(electricityRate('2026-06-06').rate, 0.155);
  assert.equal(electricityRate('2026-09-30').rate, 0.2139);
  assert.equal(electricityRate('2026-10-01').rate, 0.1285);
});

test('SMUD uses actual fixed holiday dates and the specified floating holidays', () => {
  assert.equal(electricityRate('2026-06-19').rate, 0.155);
  assert.equal(electricityRate('2026-09-07').rate, 0.155);
  // July 4 falls on Saturday. Its observed Friday is still a mid-peak weekday.
  assert.equal(electricityRate('2026-07-03').rate, 0.2139);
});

test('EV discount only applies when the session is entirely overnight', () => {
  assert.equal(electricityRate('2026-06-01', { ...settings, evDiscount: true }).rate, 0.2139);
  closeTo(electricityRate('2026-06-01', { ...settings, chargeWindow: 'overnight', evDiscount: true }).rate, 0.14);
  closeTo(electricityRate('2026-10-24', { ...settings, chargeWindow: 'overnight', evDiscount: true }).rate, 0.1135);
});

test('manual electricity rates override the schedule; future rates are visibly provisional', () => {
  assert.equal(electricityRate('2026-06-01', { ...settings, customElectricRate: 0 }).rate, 0);
  assert.equal(electricityRate('2027-06-01').provisional, true);
  assert.equal(electricityRate('2026-06-01').provisional, false);
});

test('calculator consumes electric range first and does not require enough gas range', () => {
  assert.deepEqual(splitDistance(100, 25), { electric: 25, gas: 75 });
  assert.deepEqual(splitDistance(5, 25), { electric: 5, gas: 0 });
  assert.deepEqual(splitDistance(100, 0), { electric: 0, gas: 100 });
  assert.throws(() => splitDistance(0, 25));
});

test('dashboard range changes cannot silently become negative consumption', () => {
  assert.deepEqual(rangeUsed({ electric: 25, gas: 150 }, { electric: 0, gas: 100 }), { electric: 25, gas: 50 });
  assert.throws(() => rangeUsed({ electric: 20, gas: 100 }, { electric: 25, gas: 90 }), /range increased/);
});

test('editing a trip keeps its original efficiency and prices', () => {
  const original = estimate(25, 50, settings, '2026-10-24');
  const edited = estimate(10, 50, { ...settings, gasPrice: 8, mpg: 10, customElectricRate: 0.9 }, '2026-06-01', original.rates);
  closeTo(edited.gasCost, original.gasCost);
  closeTo(edited.electricCost, 10 * 0.32 * 0.1285);
});

test('backdated trips use only fill-ups on or before the trip date', () => {
  const fills = [{ date: '2026-10-01', createdAt: '2026-10-01T12:00:00Z', total: 40, gallons: 10 }, { date: '2026-10-20', createdAt: '2026-10-20T12:00:00Z', total: 50, gallons: 10 }];
  assert.equal(latestGasPrice(fills, 3, '2026-10-10'), 4);
  assert.equal(latestGasPrice(fills, 3, '2026-09-01'), 3);
  assert.equal(latestGasPrice(fills), 5);
});

test('missing, nonnumeric, negative inputs and invalid dates are rejected', () => {
  for (const value of ['', null, undefined, 'abc', -1, Infinity]) assert.throws(() => estimate(value, 1, settings));
  assert.throws(() => parseDate('2026-02-30'));
  assert.throws(() => parseDate('2026-13-01'));
  assert.equal(localDate(parseDate('2026-10-24')), '2026-10-24');
});

test('new installs contain no invented trips or shortcuts', () => {
  const fresh = freshState();
  assert.deepEqual(fresh.trips, []);
  assert.deepEqual(fresh.shortcuts, []);
  assert.equal(fresh.settings.gasPrice, null);
  fresh.settings.mpg = 1;
  assert.equal(freshState().settings.mpg, 46);
});
