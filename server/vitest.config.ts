import 'dotenv/config';
import { defineConfig } from 'vitest/config';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL must be set to run the tests (see server/.env.example).');
}

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    // Integration tests share one seeded database, so test files run one at a time.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl,
      JWT_SECRET: 'test-only-secret-that-is-at-least-32-characters-long',
      AI_ENABLED: 'false',
      DATA_AS_OF_DATE: '2026-01-15',
    },
  },
});
