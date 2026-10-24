/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    if (input.stage !== 'prod') {
      throw new Error('Drive cost deploys only to the prod stage. Use pnpm deploy.');
    }
    if (!process.env.CLOUDFLARE_DEFAULT_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN) {
      throw new Error('Set CLOUDFLARE_DEFAULT_ACCOUNT_ID and CLOUDFLARE_API_TOKEN. See .env.example.');
    }
    return {
      name: 'drivecost',
      home: 'cloudflare',
      version: '4.17.2',
      protect: true,
      removal: 'retain',
      providers: {
        cloudflare: {
          version: '6.22.0',
          apiToken: process.env.CLOUDFLARE_API_TOKEN,
        },
      },
    };
  },
  async run() {
    // pnpm deploy builds and verifies dist/ before uploading it.
    // Static assets, custom-domain TLS, and SST state all live in Cloudflare.
    const site = new sst.cloudflare.StaticSiteV2('DriveCost', {
      path: 'dist',
      domain: { name: 'drivecost.bxtn.dev' },
      notFound: '404',
    });
    const zone = await cloudflare.getZone({
      filter: {
        name: 'bxtn.dev',
        account: { id: process.env.CLOUDFLARE_DEFAULT_ACCOUNT_ID },
      },
    });
    // HTTP alone invokes this tiny redirect Worker. HTTPS stays on static assets.
    const redirect = new sst.cloudflare.Worker('DriveCostHttpsRedirect', {
      handler: 'infra/https-redirect.js',
      url: false,
    });
    new cloudflare.WorkersRoute('DriveCostHttpRoute', {
      zoneId: zone.id,
      pattern: 'http://drivecost.bxtn.dev/*',
      script: redirect.nodes.worker.scriptName,
    }, { dependsOn: [site] });
    return { url: site.url };
  },
});
