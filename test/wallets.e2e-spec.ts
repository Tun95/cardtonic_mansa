import { randomUUID } from 'crypto';
import { TestApi } from './helpers';

describe('Wallets (e2e)', () => {
  let api: TestApi;
  beforeAll(async () => {
    api = await TestApi.create();
  });
  beforeEach(() => api.reset());
  afterAll(() => api.close());

  it('creates a wallet from an email with a zero balance in every currency', async () => {
    const res = await api.http.post('/wallets').send({ email: 'ada@example.com' }).expect(201);
    expect(res.body.email).toBe('ada@example.com');
    expect(res.body.phone).toBeNull();
    expect(res.body.balances.map((b: { currency: string }) => b.currency)).toEqual([
      'cNGN',
      'cGHS',
      'cXAF',
      'USDx',
      'EURx',
    ]);
    expect(res.body.balances.every((b: { amount: string }) => b.amount === '0.00000000')).toBe(
      true,
    );
    expect(res.body.totalUsd).toBe('0.00000000');
  });

  it('creates a wallet from a mobile number and normalises formatting', async () => {
    const res = await api.http.post('/wallets').send({ phone: '+234 801-234-5678' }).expect(201);
    expect(res.body.phone).toBe('+2348012345678');
  });

  it('rejects a duplicate email (case-insensitive) and a duplicate phone with 409', async () => {
    await api.http.post('/wallets').send({ email: 'Ada@Example.com' }).expect(201);
    const dupEmail = await api.http.post('/wallets').send({ email: 'ada@example.com' }).expect(409);
    expect(dupEmail.body.code).toBe('WALLET_ALREADY_EXISTS');

    await api.http.post('/wallets').send({ phone: '+2348012345678' }).expect(201);
    await api.http.post('/wallets').send({ phone: '+2348012345678' }).expect(409);
  });

  it('creates exactly one wallet when the same email is submitted concurrently', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        api.http.post('/wallets').send({ email: 'race@example.com' }),
      ),
    );
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(7);
  });

  it('validates input', async () => {
    const none = await api.http.post('/wallets').send({}).expect(400);
    expect(none.body.code).toBe('IDENTIFIER_REQUIRED');
    await api.http.post('/wallets').send({ email: 'not-an-email' }).expect(400);
    await api.http.post('/wallets').send({ phone: '08012345678' }).expect(400);
    await api.http.post('/wallets').send({ email: 'a@b.co', admin: true }).expect(400);
  });

  it('returns 404 for an unknown wallet and 400 for a malformed id', async () => {
    await api.http.get(`/wallets/${randomUUID()}`).expect(404);
    await api.http.get('/wallets/not-a-uuid').expect(400);
  });

  it('reports all balances and the total USD equivalent', async () => {
    const id = await api.createWallet();
    await api.deposit(id, 'cNGN', '1500').expect(201);
    await api.deposit(id, 'USDx', '100').expect(201);
    await api.deposit(id, 'EURx', '92').expect(201);

    const res = await api.http.get(`/wallets/${id}`).expect(200);
    expect(res.body.totalUsd).toBe('201.00000000'); // 1 + 100 + 100
    expect(res.body.fx.source).toBe('FIXED');
    expect(await api.balances(id)).toMatchObject({
      cNGN: '1500.00000000',
      USDx: '100.00000000',
      EURx: '92.00000000',
      cGHS: '0.00000000',
    });
  });
});
