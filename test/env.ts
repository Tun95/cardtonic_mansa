/** Tests run in an isolated Postgres schema ("test") so they never touch dev data. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://mansa:mansa@localhost:5433/mansa?schema=test&connection_limit=20';
