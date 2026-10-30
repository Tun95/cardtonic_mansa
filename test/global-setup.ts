import { execSync } from 'child_process';
import { TEST_DATABASE_URL } from './env';

/** Applies migrations to the test schema once before the e2e suite. */
export default async function globalSetup(): Promise<void> {
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
