export const DEFAULT_SETTINGS = Object.freeze({ mpg: 46, kwhPerMile: 0.32, fullRange: 25, gasPrice: null, chargeWindow: 'evening', evDiscount: false, customElectricRate: null });

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Choose a valid date.');
  const result = new Date(`${value}T12:00:00`);
  if (!Number.isFinite(result.getTime()) || localDate(result) !== value) throw new Error('Choose a valid date.');
  return result;
}

function nthWeekday(date, weekday, occurrence) {
  return date.getDay() === weekday && Math.ceil(date.getDate() / 7) === occurrence;
}

export function isSmudHoliday(value) {
  const date = parseDate(value);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  // SMUD applies fixed-date holidays on the actual date, not the observed weekday.
  return ['01-01', '06-19', '07-04', '11-11', '12-25'].includes(value.slice(5)) ||
    (month === 1 && nthWeekday(date, 1, 3)) ||
    (month === 2 && nthWeekday(date, 1, 3)) ||
    (month === 5 && date.getDay() === 1 && day + 7 > 31) ||
    (month === 9 && nthWeekday(date, 1, 1)) ||
    (month === 10 && nthWeekday(date, 1, 2)) ||
    (month === 11 && nthWeekday(date, 4, 4));
}

export function electricityRate(value, settings = DEFAULT_SETTINGS) {
  const date = parseDate(value);
  if (settings.customElectricRate !== null) return { rate: settings.customElectricRate, label: 'Your electricity rate', provisional: false };
  const summer = date.getMonth() >= 5 && date.getMonth() <= 8;
  const weekend = [0, 6].includes(date.getDay()) || isSmudHoliday(value);
  const overnight = settings.chargeWindow === 'overnight';
  let rate = summer ? (!overnight && !weekend ? 0.2139 : 0.155) : 0.1285;
  if (overnight && settings.evDiscount) rate -= 0.015;
  return { rate, label: `SMUD · ${summer ? 'summer' : 'non-summer'}${!overnight && summer && !weekend ? ' mid-peak' : ' off-peak'}${overnight && settings.evDiscount ? ' · EV discount' : ''}`, provisional: date.getFullYear() !== 2026 };
}

export function positive(value, label, allowZero = false) {
  if (value === '' || value === null || value === undefined) throw new Error(`Enter ${label}.`);
  const number = Number(value);
  if (!Number.isFinite(number) || (allowZero ? number < 0 : number <= 0)) throw new Error(`Enter ${allowZero ? 'zero or a positive' : 'a positive'} number for ${label}.`);
  return number;
}

export function estimate(electricMiles, gasMiles, settings, date = localDate(), snapshot = null) {
  const electric = positive(electricMiles, 'electric miles', true);
  const gas = positive(gasMiles, 'gas miles', true);
  const rates = snapshot || { mpg: settings.mpg, kwhPerMile: settings.kwhPerMile, electricRate: electricityRate(date, settings).rate, gasPrice: settings.gasPrice };
  positive(rates.mpg, 'MPG');
  positive(rates.kwhPerMile, 'electric efficiency');
  positive(rates.electricRate, 'electricity rate', true);
  const kwh = electric * rates.kwhPerMile;
  const gallons = gas / rates.mpg;
  const needsGasPrice = gas > 0 && (rates.gasPrice === null || rates.gasPrice === undefined);
  if (!needsGasPrice && gas > 0) positive(rates.gasPrice, 'gas price');
  const electricCost = kwh * rates.electricRate;
  const gasCost = needsGasPrice ? null : gallons * (rates.gasPrice || 0);
  return { electricMiles: electric, gasMiles: gas, miles: electric + gas, kwh, gallons, electricCost, gasCost, total: gasCost === null ? null : electricCost + gasCost, needsGasPrice, rates: { ...rates } };
}

export function rangeUsed(start, end) {
  const electric = positive(start.electric, 'starting electric range', true) - positive(end.electric, 'remaining electric range', true);
  const gas = positive(start.gas, 'starting gas range', true) - positive(end.gas, 'remaining gas range', true);
  if (electric < 0 || gas < 0) throw new Error('A range increased. Use “Enter range used” to record your own estimate instead.');
  return { electric, gas };
}

export function splitDistance(distance, electricRange) {
  const miles = positive(distance, 'trip distance');
  const electric = Math.min(miles, positive(electricRange, 'available electric range', true));
  return { electric, gas: miles - electric };
}

export function latestGasPrice(fillups, fallback = null, date = '9999-12-31') {
  const latest = fillups.filter(fill => fill.date <= date).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))[0];
  return latest ? latest.total / latest.gallons : fallback;
}

export function freshState() {
  return { version: 1, settings: { ...DEFAULT_SETTINGS }, trips: [], fillups: [], shortcuts: [], activeTrip: null, range: { electric: null, gas: null, updatedAt: null } };
}
