import { TEST_DATABASE_URL } from './env';

process.env.DATABASE_URL = TEST_DATABASE_URL;
// Deterministic rates: 1 USD = 1500 cNGN = 12.5 cGHS = 600 cXAF = 0.92 EURx
process.env.FX_PROVIDER = 'fixed';
