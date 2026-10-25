# Drive cost

I remember my uncle Dale keeping a little notebook in his car. Every time he got gas, he'd write down the mileage, how many gallons he put in, and the price. I'm still not sure what he did with all that information. Maybe he worked out his gas mileage, kept track of what the car was costing him, or just liked having a record. Whatever the reason, that little habit stuck with me.

Drive cost is my version of Uncle Dale's notebook, with electricity added to the math. A plug-in hybrid makes the question a little more interesting: some miles come from the outlet, some from the pump. This app keeps a record and helps answer the question I imagine Dale's notebook could have answered: what did that drive actually cost?

A phone-sized, browser-based PWA for estimating the energy cost of selected drives in a 2020 Kia Niro plug-in hybrid. No accounts, application backend, maps, or vehicle integration. No preloaded trips or shortcuts.

## Run

```sh
pnpm install
pnpm dev
```

Open <http://127.0.0.1:4179>. The desktop browser shows a 430px phone frame with scrollable content and persistent bottom navigation. On small screens it fills the viewport. The application itself has no runtime JavaScript dependencies; Python 3 serves `site/` during development.

## Hosting

The deployment target is **https://drivecost.bxtn.dev**, using Cloudflare Workers Static Assets through SST. SST's home provider is Cloudflare, so its deployment state and encryption material live in Cloudflare R2. There are no AWS resources or application database services.

```sh
pnpm deploy
```

The deployment script loads the ignored `.env` if present, checks the Cloudflare account and domain, runs checks and tests, builds `dist/`, exercises the production build in phone and desktop browsers, publishes the protected `prod` stage, and verifies the hosted release. See [deployment and recovery](docs/DEPLOYMENT.md) for credentials and verification.

Hosting serves the app; trip data remains in each browser. Localhost and the hosted address have separate browser storage.

## Try it

- **Log a trip:** enter electric and gas range used. Gas defaults to zero. The estimated cost updates before saving. A name is optional.
- **Start a trip:** enter the dashboard's electric and gas ranges. Finish with the remaining ranges; the app calculates the differences. An active trip survives reloads. If a range increases, switch to entering range used.
- **Shortcuts:** add your own named electric/gas usage presets, then tap one and save. Each use opens an editable trip form.
- **Fill-ups:** enter odometer, gallons, and total paid. Price per gallon is calculated automatically. Full/nearly full is the default. Date and post-fill gas range are optional details.
- **Calculator:** enter total distance, including any return, and available electric range. It uses electricity first, then gas. Calculating does not save a trip or change reported range.
- **Charged:** report a full 25-mile electric range in one tap. Settings can change that value.
- **History:** week/month totals cover logged trips only. Average $/mile below the totals divides each fuel's saved trip costs by its logged miles for the selected period, shown to three decimal places; a dash means no miles logged for that fuel. The last-seven-days chart splits gas and electricity. Gas purchases are shown separately from estimated consumption to avoid double counting.
- **Settings:** edit efficiency, starting gas price, charging time, EV enrollment, or a manual electricity rate. Export all local records as JSON.

## Calculation assumptions

Starting efficiency is **46 MPG** on gas and **0.32 kWh per electric mile**, from [EPA vehicle data](https://www.energystar.gov/products/ev_chargers/electric-vehicles-and-hybrids/details/42354). Full charge is **25 miles**, as reported by the owner.

```text
Electric cost = electric range used × kWh/mile × $/kWh
Gas cost      = gas range used ÷ MPG × $/gallon
```

Gas uses the latest recorded fill-up on or before the trip date, falling back to a manually entered starting price. Saved trips snapshot their prices and efficiency. Editing usage retains those rates; adding gas to an originally electric-only trip uses an available gas price if none was saved. Active trips retain the configuration from their start.

Default charging starts at **8 p.m.**, with **no EV discount**. The bundled [2026 SMUD Time-of-Day rates](https://www.smud.org/Rate-Information/Residential-rates/Time-of-Day-5-8pm-Rate/Rate-details) are:

| Season | 8 p.m. weekdays | 8 p.m. weekends/SMUD holidays | Midnight–6 a.m. |
| --- | --- | --- | --- |
| October–May | $0.1285/kWh | $0.1285/kWh | $0.1285/kWh |
| June–September | $0.2139/kWh | $0.1550/kWh | $0.1550/kWh |

If enabled, the EV discount subtracts $0.015/kWh only for sessions entirely between midnight and 6 a.m. Fixed-date holidays use their actual calendar date, following SMUD's holiday rules. Future years carry forward the 2026 rates and display a provisional-rate message. A manual rate overrides the schedule.

This prototype estimates charging from the trip's calendar date and selected charging window; it does not meter charging or split sessions across midnight. Dashboard range changes are proxies for consumption. Unlogged driving means the last reported range can be stale; post-trip range-used entries do not claim a new dashboard reading. Fill-ups and odometer alone cannot establish gas-only MPG because electric miles are included and some trips are unlogged. MPG remains an editable estimate.

## Local storage and offline use

Data lives in `localStorage` under `drive-cost-v1`. It stays on this browser and origin, including the port. Settings exports a JSON copy; importing/restoring is not part of this prototype. Clearing browser data clears the records.

A service worker caches the complete app and icons after an initial online visit. It can then reopen and save trips offline. The web manifest includes 192px and 512px icons; installation depends on browser support. HTTPS or localhost is required for service workers.

`pnpm build` copies only `site/` into `dist/` and generates a service-worker cache version from the public files' content. A changed release downloads into a separate cache and offers an **Update** button. The user chooses when to reload; saved trips and active trips remain in local storage. The old cache is removed after activation. Closing every app tab also allows a waiting update to activate.

## Checks

```sh
pnpm check
pnpm test
pnpm build
pnpm preview                         # production build at http://127.0.0.1:4180
pnpm exec playwright install chromium # first time only
pnpm e2e
pnpm e2e:production
E2E_BASE_URL=https://drivecost.bxtn.dev pnpm e2e
pnpm verify                          # hosted HTTP, header, and release checks
```

Unit tests cover cost arithmetic, original-rate snapshots, tariff changes and holidays, missing prices, range validation, and historical price selection. Browser tests run capture, fill-up, calculator, shortcut, persistence, offline, narrow-screen, and release-update flows in phone and desktop Chromium. The production preview applies the actual Cloudflare response-header rules. Tests use isolated browser data, never personal records. The release-update test uses its own local server to publish two test versions.
