import { freshState, localDate, parseDate, electricityRate, estimate, rangeUsed, splitDistance, latestGasPrice, positive } from './domain.js';

const STORE = 'drive-cost-v1';
const main = document.querySelector('#main');
const sheet = document.querySelector('#sheet');
const paths = {
  settings: '<path d="m9 3-.5 2-2 1-2-.5-2 3 1.5 1.5v3L2.5 15l2 3 2-.5 2 1L9 21h4l.5-2 2-1 2 .5 2-3-1.5-1.5v-3L19.5 9l-2-3-2 .5-2-1L13 3z"/><circle cx="11" cy="12" r="3"/>',
  route: '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="19" r="2"/><path d="M8 5h6a4 4 0 0 1 0 8h-4a4 4 0 0 0 0 8h6M6 7v3M18 14v3"/>',
  fuel: '<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M2 21h14M4 10h10M14 12h2a2 2 0 0 1 2 2v3a2 2 0 0 0 4 0V9l-4-4M19 6v4h3"/>',
  calculator: '<rect x="5" y="2" width="14" height="20" rx="3"/><path d="M8 6h8M8 10h2M14 10h2M8 14h2M14 14h2M8 18h2M14 18h2"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-12h-8z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  play: '<path d="m9 5 10 7-10 7z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v.1"/>',
  bookmark: '<path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16l-6-4z"/>',
  more: '<circle cx="5" cy="12" r=".7"/><circle cx="12" cy="12" r=".7"/><circle cx="19" cy="12" r=".7"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
};
function icon(name) { return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.route}</svg>`; }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
const money = (value, fractionDigits = 2) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }).format(value);
const num = (value, maximumFractionDigits = 1) => new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(value);
const id = () => crypto.randomUUID();
let state = freshState();
let storageError = '';
let period = 'month';
let page = ['trips', 'fillups', 'calculator'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'trips';
let modalContext = null;
let toastTimer;
let returnFocus = null;
let waitingWorker = null;
let updateRequested = false;

try {
  const raw = localStorage.getItem(STORE);
  if (raw) {
    const saved = JSON.parse(raw);
    if (saved.version !== 1 || !Array.isArray(saved.trips) || !Array.isArray(saved.fillups) || !Array.isArray(saved.shortcuts) || !saved.settings || !saved.range) throw new Error('This saved file is not recognized.');
    state = { ...freshState(), ...saved, settings: { ...state.settings, ...saved.settings } };
  }
} catch {
  storageError = 'Your saved data could not be opened. Nothing has been overwritten. Allow browser storage, or export the saved file below to keep a copy.';
}

function commit(change) {
  if (storageError) throw new Error('Browser storage is unavailable. Your changes have not been saved.');
  const next = structuredClone(state);
  change(next);
  try { localStorage.setItem(STORE, JSON.stringify(next)); }
  catch { throw new Error('Could not save on this device. Your changes have not been saved. Check available browser storage.'); }
  state = next;
}
function config(date = localDate()) { return { ...state.settings, gasPrice: latestGasPrice(state.fillups, state.settings.gasPrice, date) }; }
function dateText(value) { return parseDate(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
function ago(iso) {
  if (!iso) return 'No range reported yet';
  const date = new Date(iso);
  return localDate(date) === localDate() ? `Updated today, ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : `Updated ${dateText(localDate(date))}`;
}
function privacy() { return `<p class="privacy-note">${icon('lock')} Just this browser. No account. No uploads.</p>`; }
function input(name, label, value = '', unit = '', attrs = '') {
  return `<label class="field"><span>${label}</span><div class="input-wrap"><input name="${name}" type="number" inputmode="decimal" min="0" max="1000000" step="any" value="${esc(value)}" ${attrs}>${unit ? `<span class="unit">${unit}</span>` : ''}</div></label>`;
}
function dateInput(value = localDate()) { return `<label class="field"><span>Date</span><input type="date" name="date" value="${esc(value)}" max="${localDate()}" min="2000-01-01" required></label>`; }
function nameInput(value = '', label = 'Trip name', placeholder = 'Where did you go? (optional)', required = false) { return `<label class="field"><span>${label}</span><input type="text" name="name" value="${esc(value)}" placeholder="${placeholder}" maxlength="70" ${required ? 'required' : ''}></label>`; }
function rangeInputs(electric = '', gas = '', remaining = false) { return `<div class="field-grid">${input('electric', `${remaining ? 'Remaining electric' : 'Electric'} range`, electric, 'mi', 'required')}${input('gas', `${remaining ? 'Remaining gas' : 'Gas'} range`, gas, 'mi', 'required')}</div>`; }
function usageInputs(electric = '', gas = '') { return `<div class="field-grid">${input('electric', `${icon('bolt')} Electric used`, electric, 'mi', 'required')}${input('gas', `${icon('fuel')} Gas used`, gas, 'mi', 'required')}</div>`; }
function errorBox() { return '<p class="form-error" role="alert"></p>'; }
function notify(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3800);
}

function intro(kicker, title, subtitle = '') { return `<div class="page-intro"><div><p class="eyebrow">${kicker}</p><h1>${title}</h1>${subtitle ? `<p>${subtitle}</p>` : ''}</div></div>`; }
function tripRow(trip) {
  return `<button class="row-card" data-action="trip-detail" data-id="${trip.id}"><span class="row-icon">${icon(trip.gasMiles === 0 ? 'bolt' : 'route')}</span><span class="row-content"><strong>${esc(trip.name || 'A little drive')}</strong><small>${dateText(trip.date)} · ${num(trip.electricMiles)} electric / ${num(trip.gasMiles)} gas mi</small></span><span class="row-amount">${money(trip.total)}<small>estimated</small></span></button>`;
}
function periodTrips() {
  const today = localDate();
  const start = new Date();
  if (period === 'week') { start.setHours(12, 0, 0, 0); start.setDate(start.getDate() - (start.getDay() + 6) % 7); }
  else start.setDate(1);
  return state.trips.filter(trip => trip.date >= localDate(start) && trip.date <= today);
}
function chart(trips) {
  const days = Array.from({ length: 7 }, (_, i) => { const date = new Date(); date.setDate(date.getDate() - 6 + i); const key = localDate(date); const entries = trips.filter(t => t.date === key); return { date, electric: entries.reduce((sum, t) => sum + t.electricCost, 0), gas: entries.reduce((sum, t) => sum + t.gasCost, 0) }; });
  const max = Math.max(1, ...days.map(day => day.electric + day.gas));
  return `<div class="chart" role="img" aria-label="Logged trip costs over the last seven days: ${days.map(day => `${localDate(day.date)} ${money(day.electric + day.gas)}`).join(', ')}">${days.map(day => `<div class="chart-col"><div class="chart-stack" style="height:${Math.max(3, (day.electric + day.gas) / max * 60)}px" title="${dateText(localDate(day.date))}: ${money(day.electric + day.gas)}"><div class="g" style="height:${day.gas / max * 60}px"></div><div class="e" style="height:${day.electric / max * 60}px"></div></div><small>${day.date.toLocaleDateString('en-US', { weekday: 'narrow' })}</small></div>`).join('')}</div><div class="chart-key"><span><i class="dot electric-dot"></i>Electricity</span><span><i class="dot gas-dot"></i>Gas</span><span>Last 7 days</span></div>`;
}
function renderTrips() {
  const trips = periodTrips();
  const electric = trips.reduce((sum, t) => sum + t.electricCost, 0);
  const gas = trips.reduce((sum, t) => sum + t.gasCost, 0);
  const total = money(electric + gas).slice(1);
  const electricMiles = trips.reduce((sum, t) => sum + t.electricMiles, 0);
  const gasMiles = trips.reduce((sum, t) => sum + t.gasMiles, 0);
  const miles = electricMiles + gasMiles;
  const active = state.activeTrip;
  return `${intro('A LITTLE CLARITY FOR EVERY MILE', 'What did that drive cost?')}
    ${active ? `<div class="active-card"><p class="eyebrow"><i class="dot electric-dot"></i> Trip in progress</p><h2>${esc(active.name || 'Your drive')}</h2><p>Started ${dateText(active.date)} · ${num(active.electric)} electric / ${num(active.gas)} gas mi remaining</p><button class="button" data-action="finish">Finish trip ${icon('arrow')}</button></div>` : ''}
    <section class="hero" aria-label="Logged trip spending"><div class="hero-top"><span class="eyebrow">YOUR LOGGED DRIVES</span><div class="period-switch" aria-label="Spending period"><button data-action="period" data-period="week" class="${period === 'week' ? 'selected' : ''}" aria-pressed="${period === 'week'}">Week</button><button data-action="period" data-period="month" class="${period === 'month' ? 'selected' : ''}" aria-pressed="${period === 'month'}">Month</button></div></div><div class="hero-value"><span class="currency">$</span>${total}</div><p class="hero-caption">${trips.length} ${trips.length === 1 ? 'trip' : 'trips'} · ${num(miles)} range miles · estimated this ${period}</p><div class="cost-split"><div><i class="dot electric-dot"></i> Electric <strong>${money(electric)}</strong></div><div><i class="dot gas-dot"></i> Gas <strong>${money(gas)}</strong></div></div>
      <div class="cost-per-mile" role="group" aria-label="Average cost per mile"><p class="eyebrow">Average $/mile</p><div class="cost-per-mile-values"><div><span><i class="dot electric-dot"></i> Electric</span><strong>${electricMiles > 0 ? money(electric / electricMiles, 3) : `<span aria-label="No electric miles logged this ${period}">—</span>`}</strong></div><div><span><i class="dot gas-dot"></i> Gas</span><strong>${gasMiles > 0 ? money(gas / gasMiles, 3) : `<span aria-label="No gas miles logged this ${period}">—</span>`}</strong></div></div><p class="hero-caption">Based on logged miles this ${period}</p></div>
    </section>
    <div class="action-grid"><button class="action-card primary-action" data-action="log">${icon('plus')}<span>Log a trip<small>Already back? Add it.</small></span></button><button class="action-card" data-action="start" ${active ? 'disabled' : ''}>${icon('play')}<span>Start a trip<small>Finish it when you arrive.</small></span></button></div>
    ${config().gasPrice === null ? `<button class="setup-note" data-action="gas-price">${icon('fuel')}<span>One thing to get started<small>Add your last gas price for mixed drives.</small></span>${icon('arrow')}</button>` : ''}
    <div class="section-heading"><h2>Your shortcuts</h2><button class="text-button" data-action="shortcut">${icon('plus')} Add</button></div>
    ${state.shortcuts.length ? state.shortcuts.map(shortcut => `<div class="shortcut-row"><button class="row-card" data-action="use-shortcut" data-id="${shortcut.id}"><span class="row-icon">${icon('bookmark')}</span><span class="row-content"><strong>${esc(shortcut.name)}</strong><small>${num(shortcut.electric)} electric / ${num(shortcut.gas)} gas mi</small></span>${icon('arrow')}</button><button class="icon-button" data-action="edit-shortcut" data-id="${shortcut.id}" aria-label="Edit ${esc(shortcut.name)} shortcut">${icon('more')}</button></div>`).join('') : `<div class="empty-shortcuts">${icon('bookmark')}<div><strong>Same drive, fewer taps.</strong><p>Save a regular trip here when you have one.</p></div></div>`}
    <div class="range-card"><button class="text-button range-info" style="text-align:left;padding:0" data-action="range">${icon('bolt')}<span><strong>${state.range.electric === null ? 'Your electric range' : `${num(state.range.electric)} electric miles ${state.range.source === 'estimated' ? 'estimated' : 'reported'}`}</strong><small>${esc(ago(state.range.updatedAt))}</small></span></button><button class="charge-button" data-action="charged">${icon('bolt')} Charged · ${num(state.settings.fullRange)} mi</button></div>
    <div class="section-heading"><h2>Recent trips</h2><span class="muted" style="font-size:10px">${state.trips.length ? 'Tap a trip for details' : 'Ready when you are'}</span></div>
    ${state.trips.length ? [...state.trips].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).map(tripRow).join('') : `<div class="empty-state">${icon('route')}<br><strong>Your first drive starts here.</strong><p>Log a quick errand or track a longer drive.<br>Only the trips you choose to save appear here.</p></div>`}
    ${state.trips.length ? `<div class="section-heading"><h2>A week in miles & dollars</h2></div>${chart(state.trips)}` : ''}${privacy()}`;
}
function renderFillups() {
  const fills = [...state.fillups].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const current = config().gasPrice;
  const total = fills.reduce((sum, fill) => sum + fill.total, 0);
  const gallons = fills.reduce((sum, fill) => sum + fill.gallons, 0);
  return `${intro('AT THE PUMP', 'A tank at a time.', 'Your receipts, remembered.')}<div class="fuel-banner"><div class="between"><div><p class="eyebrow">CURRENT GAS PRICE</p><p class="fuel-price">${current === null ? '—' : money(current)} <span>/ gallon</span></p><small>${fills[0] ? `Last filled ${dateText(fills[0].date)}` : current === null ? 'Add a fill-up or a starting price' : 'Your starting estimate'}</small></div><span class="row-icon">${icon('fuel')}</span></div></div><button class="button" data-action="fillup">${icon('plus')} Log a fill-up</button><div class="mini-stats" style="margin-top:18px"><div><small>Gas purchased · all time</small><strong>${money(total)}</strong></div><div><small>Gallons added · all time</small><strong>${num(gallons, 2)} <span class="unit">gal</span></strong></div></div><div class="section-heading"><h2>Fill-up history</h2><span class="muted" style="font-size:10px">${fills.length} ${fills.length === 1 ? 'fill-up' : 'fill-ups'}</span></div>${fills.length ? fills.map(fill => `<button class="row-card" data-action="fillup-detail" data-id="${fill.id}"><span class="row-icon">${icon('fuel')}</span><span class="row-content"><strong>${num(fill.gallons, 3)} gallons · ${money(fill.total / fill.gallons)}/gal</strong><small>${dateText(fill.date)} · ${num(fill.odometer)} mi on odometer</small></span><span class="row-amount">${money(fill.total)}<small>paid at pump</small></span></button>`).join('') : `<div class="empty-state">${icon('fuel')}<br><strong>Next fill-up, three numbers.</strong><p>Odometer, gallons, and total paid.<br>We’ll work out the price per gallon.</p></div>`}<p class="fine-print">Gas purchases are separate from trip costs. Odometer changes include unlogged drives and electric miles, so gas efficiency stays at your editable ${num(state.settings.mpg)} MPG estimate.</p>${privacy()}`;
}
function resultMarkup(result, { showRate = false, date = localDate() } = {}) {
  const rate = electricityRate(date, state.settings);
  return `<div class="result-label">${icon('info')} Estimated driving cost</div><div class="result-value ${result.needsGasPrice ? 'incomplete' : ''}">${result.needsGasPrice ? 'Add your gas price' : money(result.total)}</div><div class="result-breakdown"><div><i class="dot electric-dot"></i>${num(result.electricMiles)} electric miles<strong>${money(result.electricCost)}</strong><small>${num(result.kwh, 2)} kWh · ${num(result.rates.electricRate * 100, 2)}¢/kWh</small></div><div><i class="dot gas-dot"></i>${num(result.gasMiles)} gas miles<strong>${result.gasCost === null ? 'Price needed' : money(result.gasCost)}</strong><small>${num(result.gallons, 2)} gal · ${result.rates.gasPrice === null ? 'No price set' : `${money(result.rates.gasPrice)}/gal`}</small></div></div>${showRate ? `<p class="rate-note">${icon('bolt')}<span>${esc(rate.label)} · ${state.settings.customElectricRate !== null ? 'manual rate' : `${state.settings.chargeWindow === 'evening' ? '8 p.m.' : 'midnight–6 a.m.'} charging`}${rate.provisional ? '<br>2026 rates carried forward; check your latest bill.' : ''}</span></p>` : ''}${result.needsGasPrice ? '<button type="button" class="button secondary" data-action="gas-price">Set starting gas price</button>' : ''}`;
}
function renderCalculator() {
  const range = state.range.electric ?? state.settings.fullRange;
  const split = splitDistance(100, range);
  return `${intro('THE WHAT-IF CORNER', 'Before you hit the road.', 'A distance. A little math. Your answer.')}<form id="calculator-form" class="card"><div class="card-title">${icon('route')} Plan a drive</div>${input('distance', 'Total distance, including the return', 100, 'mi', 'required min="0.1"')}<div class="between" style="align-items:flex-end">${input('electric', 'Available electric range', range, 'mi', 'required')}<button type="button" class="charge-button" data-action="calculator-full" style="margin:0 0 18px 12px">Full · ${num(state.settings.fullRange)} mi</button></div><p class="fine-print" style="margin-top:-6px">${state.range.updatedAt ? `${esc(ago(state.range.updatedAt))}. Check the dashboard if you’ve driven since.` : 'Assuming a full charge. Adjust to match your dashboard.'}</p><div id="calculator-result" class="calculation" aria-live="polite">${resultMarkup(estimate(split.electric, split.gas, config()), { showRate: true })}</div>${errorBox()}<button class="button outline" type="submit">${icon('plus')} Log this estimate as a trip</button></form><p class="fine-print">Electric range is used first; gas covers the rest. Assumes no recharge during the drive. Calculating won’t change your reported range or save a trip.</p>${privacy()}`;
}
function render() {
  document.querySelector('#settings-button').innerHTML = icon('settings');
  document.querySelector('.bottom-nav').innerHTML = [['trips', 'route', 'Trips'], ['fillups', 'fuel', 'Fill-ups'], ['calculator', 'calculator', 'Calculator']].map(([route, glyph, label]) => `<a class="nav-item ${page === route ? 'active' : ''}" href="#${route}" ${page === route ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${label}</span></a>`).join('');
  if (storageError) { main.innerHTML = `<div class="storage-error">${esc(storageError)}<button class="button secondary" data-action="export">Export saved data</button></div>`; return; }
  main.innerHTML = page === 'calculator' ? renderCalculator() : page === 'fillups' ? renderFillups() : renderTrips();
  const calc = document.querySelector('#calculator-form');
  if (calc) {
    calc.addEventListener('input', updateCalculator);
    calc.addEventListener('submit', event => { event.preventDefault(); try { const fields = new FormData(calc); const split = splitDistance(fields.get('distance'), fields.get('electric')); showTripForm({ electric: split.electric, gas: split.gas }); } catch (error) { calc.querySelector('.form-error').textContent = error.message; } });
  }
}
function updateCalculator() {
  const form = document.querySelector('#calculator-form');
  if (!form) return;
  try {
    const values = new FormData(form);
    const split = splitDistance(values.get('distance'), values.get('electric'));
    form.querySelector('#calculator-result').innerHTML = resultMarkup(estimate(split.electric, split.gas, config()), { showRate: true });
    form.querySelector('.form-error').textContent = '';
  } catch (error) { form.querySelector('#calculator-result').innerHTML = '<p class="fine-print">Enter a distance and available range to see the estimate.</p>'; }
}

function openSheet(title, body, handler, context = null) {
  if (!sheet.open) returnFocus = document.activeElement;
  modalContext = context;
  sheet.innerHTML = `<div class="sheet-header"><h2 id="sheet-title">${title}</h2><button type="button" class="icon-button" data-action="close" aria-label="Close">${icon('close')}</button></div><div class="sheet-body">${body}</div>`;
  sheet.onsubmit = event => {
    event.preventDefault();
    const form = event.target;
    if (!form.reportValidity()) return;
    try { handler?.(new FormData(form), form); }
    catch (error) { const errorNode = form.querySelector('.form-error') || sheet.querySelector('.form-error'); if (errorNode) errorNode.textContent = error.message; else notify(error.message); }
  };
  sheet.oninput = updateSheetEstimate;
  if (!sheet.open) sheet.showModal();
  sheet.scrollTop = 0;
}
function closeSheet() { sheet.close(); modalContext = null; if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); }
sheet.addEventListener('click', event => { if (event.target === sheet) { const rect = sheet.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeSheet(); } });
sheet.addEventListener('close', () => { modalContext = null; });

function showTripForm(initial = {}, editId = null) {
  const existing = editId ? state.trips.find(trip => trip.id === editId) : null;
  const values = existing ? { electric: existing.electricMiles, gas: existing.gasMiles, name: existing.name, date: existing.date } : initial;
  openSheet(existing ? 'Edit trip' : 'Log a trip', `<p>Enter the dashboard range you used. A quick estimate is fine.</p><form id="trip-form">${nameInput(values.name)}${usageInputs(values.electric ?? '', values.gas ?? 0)}<details><summary>Date & shortcut</summary>${dateInput(values.date)}${!existing ? '<label class="check-field"><input type="checkbox" name="shortcut"> Save these miles as a shortcut</label>' : ''}</details><div id="live-estimate" class="calculation" aria-live="polite"></div>${errorBox()}<button class="button" type="submit">${icon('check')} ${existing ? 'Save changes' : 'Save trip'}</button></form>`, (fields, form) => {
    const electric = positive(fields.get('electric'), 'electric miles', true);
    const gas = positive(fields.get('gas'), 'gas miles', true);
    const date = fields.get('date'); parseDate(date);
    const savedRates = existing ? { ...existing.rates, gasPrice: existing.rates.gasPrice ?? config(date).gasPrice } : null;
    const result = estimate(electric, gas, config(date), date, savedRates);
    if (result.miles === 0) throw new Error('Enter at least one mile of range used.');
    if (result.needsGasPrice) throw new Error('Set your starting gas price before saving gas miles.');
    const name = String(fields.get('name')).trim();
    if (fields.get('shortcut') && !name) throw new Error('Give the trip a name to save a shortcut.');
    commit(next => {
      const trip = { ...result, id: existing?.id || id(), name, date, createdAt: existing?.createdAt || new Date().toISOString(), source: existing?.source || 'range-used' };
      if (existing) next.trips[next.trips.findIndex(item => item.id === existing.id)] = trip;
      else next.trips.push(trip);
      if (fields.get('shortcut')) next.shortcuts.push({ id: id(), name, electric, gas });
      // Range-used logs may be retrospective. They never pretend to be a current dashboard reading.
    });
    closeSheet(); render(); notify(existing ? 'Trip updated. Original prices kept.' : 'Trip saved.');
  }, { type: 'trip', existing });
  updateSheetEstimate();
}
function showStart() {
  if (state.activeTrip) return showFinish();
  openSheet('Start a trip', `<p>Read the two remaining ranges from your dashboard. We’ll ask again when you arrive.</p><form>${nameInput()}${rangeInputs(state.range.electric ?? '', state.range.gas ?? '')}${errorBox()}<button class="button" type="submit">${icon('play')} Start trip</button></form>`, fields => {
    const electric = positive(fields.get('electric'), 'electric range', true);
    const gas = positive(fields.get('gas'), 'gas range', true);
    const now = new Date().toISOString();
    commit(next => { next.activeTrip = { id: id(), name: String(fields.get('name')).trim(), electric, gas, date: localDate(), createdAt: now, settings: config() }; next.range = { electric, gas, updatedAt: now, source: 'reported' }; });
    closeSheet(); page = 'trips'; location.hash = 'trips'; render(); notify('Trip started. See you when you arrive.');
  });
}
function showFinish(mode = 'remaining') {
  const active = state.activeTrip;
  if (!active) return;
  openSheet('Finish your trip', `<p>${esc(active.name || 'Your drive')} · started with ${num(active.electric)} electric and ${num(active.gas)} gas miles.</p><div class="segmented"><button type="button" data-action="finish-mode" data-mode="remaining" class="${mode === 'remaining' ? 'selected' : ''}">Remaining ranges</button><button type="button" data-action="finish-mode" data-mode="used" class="${mode === 'used' ? 'selected' : ''}">Enter range used</button></div><form>${mode === 'remaining' ? rangeInputs('', '', true) : usageInputs('', 0)}<div id="live-estimate" class="calculation" aria-live="polite"></div>${errorBox()}<button class="button" type="submit">${icon('check')} Finish & save trip</button><button class="text-button full-width" type="button" data-action="cancel-trip">Discard this started trip</button></form>`, fields => {
    const electric = positive(fields.get('electric'), mode === 'remaining' ? 'remaining electric range' : 'electric miles used', true);
    const gas = positive(fields.get('gas'), mode === 'remaining' ? 'remaining gas range' : 'gas miles used', true);
    const used = mode === 'remaining' ? rangeUsed(active, { electric, gas }) : { electric, gas };
    const tripSettings = { ...active.settings, gasPrice: active.settings.gasPrice ?? config(active.date).gasPrice };
    const result = estimate(used.electric, used.gas, tripSettings, active.date);
    if (result.miles === 0) throw new Error('No range was used. Enter at least one mile, or discard this trip.');
    if (result.needsGasPrice) throw new Error('Set your starting gas price before saving gas miles.');
    const now = new Date().toISOString();
    commit(next => { next.trips.push({ ...result, id: active.id, name: active.name, date: active.date, createdAt: active.createdAt, endedAt: now, source: mode === 'remaining' ? 'dashboard-difference' : 'range-used' }); next.activeTrip = null; next.range = mode === 'remaining' ? { electric, gas, updatedAt: now, source: 'reported' } : { electric: null, gas: null, updatedAt: null }; });
    closeSheet(); render(); notify('Trip finished and saved.');
  }, { type: 'finish', mode });
  updateSheetEstimate();
}
function updateSheetEstimate() {
  const output = sheet.querySelector('#live-estimate');
  if (!output || !modalContext) return;
  const fields = new FormData(sheet.querySelector('form'));
  try {
    let electric = positive(fields.get('electric'), 'electric miles', true);
    let gas = positive(fields.get('gas'), 'gas miles', true);
    const date = fields.get('date') || state.activeTrip?.date || localDate();
    let settings = config(date);
    if (modalContext.type === 'finish') { settings = { ...state.activeTrip.settings, gasPrice: state.activeTrip.settings.gasPrice ?? config(date).gasPrice }; if (modalContext.mode === 'remaining') { const used = rangeUsed(state.activeTrip, { electric, gas }); electric = used.electric; gas = used.gas; } }
    const existingRates = modalContext.existing?.rates;
    const savedRates = existingRates ? { ...existingRates, gasPrice: existingRates.gasPrice ?? config(date).gasPrice } : null;
    output.innerHTML = resultMarkup(estimate(electric, gas, settings, date, savedRates));
  } catch (error) { output.innerHTML = `<p class="fine-print">${fields.get('electric') === '' || fields.get('gas') === '' ? 'Enter both ranges to see the cost before saving.' : esc(error.message)}</p>`; }
}

function showFillup(editId = null) {
  const existing = state.fillups.find(fill => fill.id === editId);
  openSheet(existing ? 'Edit fill-up' : 'Log a fill-up', `<p>Three numbers from the car and the receipt.</p><form>${input('odometer', 'Odometer', existing?.odometer ?? '', 'mi', 'required step="0.1"') }<div class="field-grid">${input('gallons', 'Gallons added', existing?.gallons ?? '', 'gal', 'required min="0.001"')}${input('total', 'Total paid', existing?.total ?? '', '$', 'required min="0.01" step="0.01"')}</div><label class="check-field"><input type="checkbox" name="full" ${!existing || existing.full ? 'checked' : ''}>Filled to full (or nearly full)</label><details><summary>Date & remaining gas range</summary>${dateInput(existing?.date)}${input('range', 'Gas range after filling (optional)', existing?.range ?? '', 'mi')}</details><p id="fillup-price" class="inline-message">We’ll calculate your price per gallon.</p>${errorBox()}<button type="submit" class="button">${icon('check')} Save fill-up</button></form>`, fields => {
    const odometer = positive(fields.get('odometer'), 'odometer', true);
    const gallons = positive(fields.get('gallons'), 'gallons');
    const total = positive(fields.get('total'), 'total paid');
    const date = fields.get('date'); parseDate(date);
    const range = fields.get('range') === '' ? null : positive(fields.get('range'), 'gas range', true);
    const others = state.fillups.filter(fill => fill.id !== existing?.id);
    if (others.some(fill => fill.date < date && fill.odometer > odometer) || others.some(fill => fill.date > date && fill.odometer < odometer)) throw new Error('This odometer conflicts with another fill-up. Check the date and mileage.');
    commit(next => {
      const fill = { id: existing?.id || id(), createdAt: existing?.createdAt || new Date().toISOString(), date, odometer, gallons, total, full: fields.get('full') === 'on', range };
      if (existing) next.fillups[next.fillups.findIndex(item => item.id === existing.id)] = fill;
      else next.fillups.push(fill);
      if (!existing && date === localDate()) { next.range.gas = range; }
    });
    closeSheet(); render(); notify(`Fill-up saved · ${money(total / gallons)}/gallon.`);
  });
  sheet.oninput = () => { const fields = new FormData(sheet.querySelector('form')); const total = Number(fields.get('total')); const gallons = Number(fields.get('gallons')); sheet.querySelector('#fillup-price').textContent = total > 0 && gallons > 0 ? `${money(total / gallons)} per gallon · used for future trip estimates.` : 'We’ll calculate your price per gallon.'; };
}
function showShortcut(editId = null) {
  const existing = state.shortcuts.find(shortcut => shortcut.id === editId);
  openSheet(existing ? 'Edit shortcut' : 'Make a shortcut', `<p>A familiar drive, ready to log again. You can adjust the miles each time.</p><form>${nameInput(existing?.name, 'Shortcut name', 'e.g. School pickup', true)}${usageInputs(existing?.electric ?? '', existing?.gas ?? 0)}${errorBox()}<button type="submit" class="button">${icon('bookmark')} Save shortcut</button>${existing ? `<button type="button" class="text-button full-width" data-action="delete-shortcut" data-id="${existing.id}">Remove shortcut</button>` : ''}</form>`, fields => {
    const name = String(fields.get('name')).trim();
    const electric = positive(fields.get('electric'), 'electric miles', true);
    const gas = positive(fields.get('gas'), 'gas miles', true);
    if (!name) throw new Error('Give your shortcut a name.');
    if (electric + gas === 0) throw new Error('Enter at least one mile.');
    commit(next => { const shortcut = { id: existing?.id || id(), name, electric, gas }; if (existing) next.shortcuts[next.shortcuts.findIndex(item => item.id === existing.id)] = shortcut; else next.shortcuts.push(shortcut); });
    closeSheet(); render(); notify('Shortcut saved.');
  });
}
function showRange() {
  openSheet('Update reported range', `<p>Match your dashboard. Unlogged drives won’t update these numbers automatically.</p><form>${input('electric', 'Electric range now', state.range.electric ?? '', 'mi', 'required')}${input('gas', 'Gas range now (optional)', state.range.gas ?? '', 'mi')}${errorBox()}<button type="submit" class="button">Save range</button></form>`, fields => {
    const electric = positive(fields.get('electric'), 'electric range', true);
    const gas = fields.get('gas') === '' ? null : positive(fields.get('gas'), 'gas range', true);
    commit(next => { next.range = { electric, gas, updatedAt: new Date().toISOString(), source: 'reported' }; });
    closeSheet(); render(); notify('Reported range updated.');
  });
}

function showGasPrice() {
  // Keep an unsaved trip/finish/calculator draft while the missing price is entered.
  const previous = { html: sheet.innerHTML, handler: sheet.onsubmit, context: modalContext, inputHandler: sheet.oninput, open: sheet.open };
  const values = previous.open ? [...sheet.querySelectorAll('input')].map(input => ({ name: input.name, value: input.value, checked: input.checked })) : [];
  const calcValues = document.querySelector('#calculator-form') ? Object.fromEntries(new FormData(document.querySelector('#calculator-form'))) : null;
  openSheet('Starting gas price', `<p>Use the price per gallon from your last receipt. A fill-up will replace it for future estimates.</p><form>${input('price', 'Gas price per gallon', state.settings.gasPrice ?? '', '$/gal', 'required min="0.01"')}${errorBox()}<button type="submit" class="button">Save gas price</button></form>`, fields => {
    const price = positive(fields.get('price'), 'gas price');
    commit(next => { next.settings.gasPrice = price; if (next.activeTrip && next.activeTrip.settings.gasPrice === null) next.activeTrip.settings.gasPrice = price; });
    if (previous.open) {
      sheet.innerHTML = previous.html; sheet.onsubmit = previous.handler; sheet.oninput = previous.inputHandler; modalContext = previous.context;
      for (const saved of values) { const input = [...sheet.querySelectorAll('input')].find(input => input.name === saved.name); if (input) { input.value = saved.value; input.checked = saved.checked; } }
      updateSheetEstimate();
    } else {
      closeSheet(); render();
      if (calcValues) { const form = document.querySelector('#calculator-form'); for (const [name, value] of Object.entries(calcValues)) form.elements[name].value = value; updateCalculator(); }
    }
    notify('Starting gas price saved.');
  });
}

function line(label, value, extra = '') { return `<div class="detail-line ${extra}"><span>${label}</span><strong>${value}</strong></div>`; }
function showTripDetail(tripId) {
  const trip = state.trips.find(item => item.id === tripId); if (!trip) return;
  openSheet(esc(trip.name || 'Your drive'), `<span class="detail-tag">${trip.source === 'dashboard-difference' ? 'Dashboard range difference' : 'Range used'} · ${dateText(trip.date)}</span>${line('Electric range used', `${num(trip.electricMiles)} mi`)}${line('Gas range used', `${num(trip.gasMiles)} mi`)}${line('Electricity', `${num(trip.kwh, 2)} kWh × ${num(trip.rates.electricRate * 100, 2)}¢`)}${line('Gasoline', `${num(trip.gallons, 2)} gal × ${money(trip.rates.gasPrice || 0)}`)}${line('Estimated trip cost', money(trip.total), 'total')}<p class="fine-print">Saved with ${num(trip.rates.mpg)} MPG and ${num(trip.rates.kwhPerMile, 2)} kWh/mi. Later price changes won’t change this trip. Dashboard range is an estimate, not measured energy use.</p><div class="sheet-actions"><button class="button secondary" data-action="edit-trip" data-id="${trip.id}">Edit trip</button><button class="button outline" data-action="repeat-trip" data-id="${trip.id}">Log again</button></div><button class="text-button full-width" data-action="delete-trip" data-id="${trip.id}">Delete trip</button>`);
}
function showFillupDetail(fillId) {
  const fill = state.fillups.find(item => item.id === fillId); if (!fill) return;
  const previous = state.fillups.filter(item => item.id !== fill.id && (item.date < fill.date || item.date === fill.date && item.odometer < fill.odometer)).sort((a, b) => b.odometer - a.odometer)[0];
  const miles = previous ? fill.odometer - previous.odometer : null;
  openSheet('Fill-up receipt', `<span class="detail-tag">${dateText(fill.date)} · ${fill.full ? 'Full or nearly full' : 'Partial fill'}</span>${line('Odometer', `${num(fill.odometer)} mi`)}${line('Gallons added', `${num(fill.gallons, 3)} gal`)}${line('Price per gallon', money(fill.total / fill.gallons))}${line('Total paid', money(fill.total), 'total')}${miles !== null ? `<p class="inline-message">${num(miles)} odometer miles since the previous fill-up. Includes electric driving and any unlogged trips.</p>` : ''}<p class="fine-print">This purchase updates estimates for new trips. Already saved trips keep their original prices.</p><button class="button secondary" data-action="edit-fillup" data-id="${fill.id}">Edit fill-up</button><button class="text-button full-width" data-action="delete-fillup" data-id="${fill.id}">Delete fill-up</button>`);
}
function showSettings() {
  const s = state.settings;
  openSheet('Your car & costs', `<p>Set once. Adjust whenever life changes.</p><form><span class="detail-tag">2020 Kia Niro · plug-in hybrid</span><div class="settings-section"><h3>Driving estimates</h3><div class="field-grid">${input('mpg', 'Gas efficiency', s.mpg, 'MPG', 'required min="0.1"')}${input('fullRange', 'Full electric range', s.fullRange, 'mi', 'required min="0.1"')}</div>${input('kwhPerMile', 'Electricity used per electric mile', s.kwhPerMile, 'kWh/mi', 'required min="0.001"')}<p class="fine-print">Starts with published 46 MPG and 0.32 kWh/mi. Fill-ups alone can’t distinguish electric miles from gas miles.</p></div><div class="settings-section"><h3>Home charging · SMUD</h3><label class="field"><span>Usual charging time</span><select name="chargeWindow"><option value="evening" ${s.chargeWindow === 'evening' ? 'selected' : ''}>Starts at 8 p.m.</option><option value="overnight" ${s.chargeWindow === 'overnight' ? 'selected' : ''}>Entirely midnight–6 a.m.</option></select></label><label class="check-field"><input type="checkbox" name="evDiscount" ${s.evDiscount ? 'checked' : ''}>Enrolled in SMUD’s EV discount</label>${input('customElectricRate', 'Override electricity rate (optional)', s.customElectricRate === null ? '' : Number((s.customElectricRate * 100).toFixed(4)), '¢/kWh')}<p class="fine-print">Uses the trip date as an estimate of the charging date. In summer, 8 p.m.–midnight is 21.39¢/kWh on weekdays and 15.50¢ on weekends and SMUD holidays; non-summer is 12.85¢. EV discounts apply only to midnight–6 a.m. charging. A session spanning midnight may cost less than this estimate.</p><p class="fine-print">Bundled rates are for 2026. Check your bill for future changes, taxes, or other rate plans. Fixed monthly charges aren’t part of trip costs.</p></div><div class="settings-section"><h3>Starting gas price</h3>${input('gasPrice', 'Before your first recorded fill-up', s.gasPrice ?? '', '$/gal')}<p class="fine-print">Your latest fill-up on or before a trip takes priority.</p></div>${errorBox()}<button type="submit" class="button">Save settings</button></form><div class="settings-section"><h3>Your data</h3><p class="fine-print" style="margin-bottom:12px">Saved only in this browser. Export a copy before clearing browser data.</p><button class="button outline" data-action="export">${icon('download')} Export data</button></div><p class="source-links">Sources: <a href="https://www.energystar.gov/products/ev_chargers/electric-vehicles-and-hybrids/details/42354" target="_blank" rel="noreferrer">EPA vehicle efficiency</a> · <a href="https://www.smud.org/Rate-Information/Residential-rates/Time-of-Day-5-8pm-Rate/Rate-details" target="_blank" rel="noreferrer">SMUD 2026 rates</a></p>`, fields => {
    const settings = { mpg: positive(fields.get('mpg'), 'MPG'), fullRange: positive(fields.get('fullRange'), 'full electric range'), kwhPerMile: positive(fields.get('kwhPerMile'), 'electric consumption'), gasPrice: fields.get('gasPrice') === '' ? null : positive(fields.get('gasPrice'), 'gas price'), chargeWindow: fields.get('chargeWindow'), evDiscount: fields.get('evDiscount') === 'on', customElectricRate: fields.get('customElectricRate') === '' ? null : positive(fields.get('customElectricRate'), 'electricity rate', true) / 100 };
    commit(next => { next.settings = settings; }); closeSheet(); render(); notify('Settings saved. Past trips kept their prices.');
  });
}
function exportData() {
  const raw = storageError ? localStorage.getItem(STORE) : JSON.stringify(state, null, 2);
  const url = URL.createObjectURL(new Blob([raw || '{}'], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `drive-cost-${localDate()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify('Data exported.');
}

document.querySelector('#settings-button').addEventListener('click', showSettings);
window.addEventListener('hashchange', () => { page = ['trips', 'fillups', 'calculator'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'trips'; render(); main.scrollTop = 0; window.scrollTo(0, 0); });
window.addEventListener('storage', event => { if (event.key === STORE) { notify('Data changed in another tab. Reload to continue.'); storageError = 'Data changed in another tab. Reload this page before making more changes.'; render(); } });
document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]'); if (!button || button.disabled) return;
  const action = button.dataset.action;
  const itemId = button.dataset.id;
  try {
    if (action === 'close') closeSheet();
    else if (action === 'log') showTripForm();
    else if (action === 'start') showStart();
    else if (action === 'finish') showFinish();
    else if (action === 'finish-mode') showFinish(button.dataset.mode);
    else if (action === 'fillup') showFillup();
    else if (action === 'shortcut') showShortcut();
    else if (action === 'edit-shortcut') showShortcut(itemId);
    else if (action === 'use-shortcut') { const shortcut = state.shortcuts.find(item => item.id === itemId); showTripForm(shortcut); }
    else if (action === 'range') showRange();
    else if (action === 'gas-price') showGasPrice();
    else if (action === 'period') { period = button.dataset.period; render(); }
    else if (action === 'charged') { commit(next => { next.range.electric = next.settings.fullRange; next.range.updatedAt = new Date().toISOString(); next.range.source = 'reported'; }); render(); notify(`Charged. ${num(state.settings.fullRange)} electric miles reported.`); }
    else if (action === 'calculator-full') { const form = document.querySelector('#calculator-form'); form.elements.electric.value = state.settings.fullRange; updateCalculator(); }
    else if (action === 'trip-detail') showTripDetail(itemId);
    else if (action === 'fillup-detail') showFillupDetail(itemId);
    else if (action === 'edit-trip') showTripForm({}, itemId);
    else if (action === 'edit-fillup') showFillup(itemId);
    else if (action === 'repeat-trip') { const trip = state.trips.find(item => item.id === itemId); showTripForm({ name: trip.name, electric: trip.electricMiles, gas: trip.gasMiles }); }
    else if (action === 'export') exportData();
    else if (action === 'apply-update' && waitingWorker) {
      updateRequested = true;
      button.disabled = true;
      button.textContent = 'Updating…';
      waitingWorker.postMessage({ type: 'APPLY_UPDATE' });
    }
    else if (['delete-trip', 'delete-fillup', 'delete-shortcut', 'cancel-trip'].includes(action)) {
      if (button.dataset.confirm !== 'yes') { button.dataset.confirm = 'yes'; button.textContent = action === 'cancel-trip' ? 'Tap again to discard' : 'Tap again to delete'; return; }
      commit(next => { if (action === 'delete-trip') next.trips = next.trips.filter(item => item.id !== itemId); if (action === 'delete-fillup') next.fillups = next.fillups.filter(item => item.id !== itemId); if (action === 'delete-shortcut') next.shortcuts = next.shortcuts.filter(item => item.id !== itemId); if (action === 'cancel-trip') next.activeTrip = null; }); closeSheet(); render(); notify(action === 'cancel-trip' ? 'Started trip discarded.' : 'Deleted.');
    }
  } catch (error) { notify(error.message); }
});

render();
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updateRequested) location.reload();
  });
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(registration => {
    function offerUpdate(worker) {
      waitingWorker = worker;
      document.querySelector('#update-banner').hidden = false;
    }
    if (registration.waiting && navigator.serviceWorker.controller) offerUpdate(registration.waiting);
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
      });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && navigator.onLine) registration.update().catch(() => {});
    });
  }).catch(() => notify('Offline setup is unavailable. The app still works while this page is open.'));
}
