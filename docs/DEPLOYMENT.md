# Cloudflare deployment

## Ownership

SST app **drivecost**, protected stage **prod**, owns the Drive cost static-asset Worker and **drivecost.bxtn.dev**. The existing `bxtn.dev` Cloudflare zone is reused. The custom domain provisions DNS and TLS through Cloudflare. A second, tiny Worker on the exact route `http://drivecost.bxtn.dev/*` redirects HTTP to HTTPS without changing sibling sites or zone-wide settings. HTTPS requests continue to serve static assets directly. The redirect Worker has no public `workers.dev` URL.

The only deployment provider is Cloudflare. `home: 'cloudflare'` keeps SST state and encryption material in R2, following `../settle-up` and `../bxtn-dev`. The site uses Workers Static Assets, with no AWS resources, D1, KV, or server-side trip storage. Existing sibling Workers and domains are outside this stack.

## Credentials

Requires Node 22.12+, pnpm, Python 3 for the source preview, and a Cloudflare token for the same account and zone used by the Cloudflare-only siblings:

- Account: Workers Scripts — Edit.
- Account: Workers R2 Storage — Edit, including buckets and objects for SST state.
- Zone `bxtn.dev`: Workers Routes — Edit, DNS — Edit, Zone — Read.

Put `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_DEFAULT_ACCOUNT_ID` in the shell environment or an ignored `.env`, following `.env.example`. The project's `.env`, when present, overrides those two inherited variables. Credentials never enter the public bundle. `.env`, `.sst/`, `dist/`, and test artifacts are ignored by Git.

Do not store real credentials in source files, CLI arguments, deployment documentation, or version control. R2 must already be enabled in the selected account; the sibling deployments normally satisfy this requirement. SST manages its own state storage, so separate S3 credentials are unnecessary.

## Deploy

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium # first time only
pnpm deploy
```

`pnpm deploy` runs:

1. Read-only Cloudflare preflight: active token, matching account/zone, Workers and R2 access, and custom-domain ownership. An unrelated DNS destination or Worker at the target address stops deployment.
2. JavaScript syntax checks and calculation unit tests.
3. A fresh production build in `dist/`.
4. Phone and desktop browser tests against that build, with Cloudflare's cache and security headers applied.
5. `sst deploy --stage prod`, uploading only `dist/`.
6. Hosted HTTP checks for HTTPS redirects, browser policies, matching release files, and private source-file exclusions.

The SST and Cloudflare provider versions are pinned to the versions used by the siblings. Other stages are rejected to prevent another stack from taking the same hostname. Removal is protected and resources are retained.

Always use `pnpm deploy` to rebuild and verify before publishing. A direct SST invocation can upload stale `dist/` contents. Do not use `sst remove` as a publishing command.

## Production behavior

`site/_headers` configures revalidation for mutable filenames, a noncached service-worker script, MIME sniffing protection, same-origin script loading, and other browser policies. `Cache-Control: no-transform` prevents Cloudflare from injecting analytics and JavaScript Detection scripts into the local-only app. See Cloudflare's [analytics guidance](https://developers.cloudflare.com/web-analytics/get-started/) and [JavaScript Detections documentation](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/javascript-detections/). The content security policy allows inline styles for the existing layouts and chart bars; scripts remain restricted to the same origin. A missing path returns the dedicated 404 page rather than the app shell, since navigation uses URL hashes.

The build hashes the public files and writes that revision into `dist/sw.js`. Rebuilding unchanged source produces the same cache revision. Changed files produce a new revision without manually editing a cache name. A new service worker installs a complete new shell before activation. It waits until the user clicks **Update** or closes all app tabs. There is no automatic reload during trip entry.

The browser stores trip records and active trips separately from cached application files. Clearing browser storage deletes those records; replacing the deployed app does not. The hosted address and localhost have different records. Export data from Settings before clearing storage; restore/import is not implemented yet.

## Verify

After SST succeeds, confirm HTTPS, response headers, the manifest and both icons, and a missing URL. Run the same browser flows against the live deployment:

```sh
E2E_BASE_URL=https://drivecost.bxtn.dev pnpm e2e
pnpm verify
```

The tests use fresh isolated browser contexts and never touch the user's saved browser data. Their app-update case publishes two versions to a temporary local server; it does not mutate the deployed Worker. Check the hosted URL in a phone browser and use that browser's install action if desired.

## Recovery

Keep `sst.config.ts`, `pnpm-lock.yaml`, stable app/stage names, and the Cloudflare R2 state intact. Do not delete state or encryption material. If a deploy fails partway through, retain `.sst/` and retry the same stack after fixing the reported issue.

To roll back, restore the desired source revision and run `pnpm deploy`. The source-content hash creates the matching application cache revision, while browser trip records stay intact. No deployments or secrets are configured in GitHub; publishing is manual from a machine with Cloudflare credentials.
