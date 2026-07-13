import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';
import { TEST_SERVICE_ACCOUNT_JSON } from './test/fixtures/testServiceAccount.js';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          bindings: {
            // Fake (non-production) service account + database URL so tests
            // can exercise real RS256 signing / routing logic without
            // touching a real Firebase project. Outbound `fetch` calls are
            // still mocked per-test via dependency-injected fetchFn params.
            FIREBASE_SERVICE_ACCOUNT_KEY: TEST_SERVICE_ACCOUNT_JSON,
            FIREBASE_DATABASE_URL: 'https://watch-together-test-default-rtdb.firebaseio.com',
          },
        },
      },
    },
  },
});
