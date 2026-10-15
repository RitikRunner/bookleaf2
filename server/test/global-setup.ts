import { execSync } from 'node:child_process';

/** Rebuilds the test database from migrations and seeds it before the suite runs. */
export default function setup() {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
  const databaseName = new URL(testDatabaseUrl).pathname.slice(1);

  // This wipes the database, so refuse anything that doesn't look like a dedicated test database.
  if (!databaseName.endsWith('_test')) {
    throw new Error(`Refusing to reset "${databaseName}": TEST_DATABASE_URL must point to a database ending in _test.`);
  }

  execSync('npx prisma migrate reset --force --skip-generate', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
  });
}
