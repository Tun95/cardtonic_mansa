import { randomUUID } from 'crypto';
import { TestApi } from './helpers';

describe('Deposits, swaps and transfers (e2e)', () => {
  let api: TestApi;
  beforeAll(async () => {
    api = await TestApi.create();
  });
  beforeEach(() => api.reset());
  afterAll(() => api.close());

  describe('deposits', () => {
    it('credits the balance immediately and records a transaction', async () => {
      const id = await api.createWallet();
      const res = await api.deposit(id, 'cNGN', '2500.5').expect(201);

      expect(res.body).toMatchObject({
        type: 'DEPOSIT',
        senderWalletId: null,
        receiverWalletId: id,
        sourceCurrency: 'cNGN',
        sourceAmount: '2500.50000000',
        destCurrency: 'cNGN',
        destAmount: '2500.50000000',
        rate: '1',
      });
      expect((await api.balances(id)).cNGN).toBe('2500.50000000');
    });

    it('keeps exact decimal precision across many small deposits', async () => {
      const id = await api.createWallet();
      for (let i = 0; i < 10; i++) await api.deposit(id, 'USDx', '0.1').expect(201);
      expect((await api.balances(id)).USDx).toBe('1.00000000');
    });

    it.each([['0'], ['-5'], ['abc'], ['1.123456789'], ['1e3'], ['']])(
      'rejects invalid amount %p',
      async (amount) => {
        const id = await api.createWallet();
        await api.deposit(id, 'USDx', amount).expect(400);
      },
    );

    it('rejects an unsupported currency, a missing key and an unknown wallet', async () => {
      const id = await api.createWallet();
      await api.deposit(id, 'BTC', '10').expect(400);
      await api.http
        .post(`/wallets/${id}/deposits`)
        .send({ currency: 'USDx', amount: '10' })
        .expect(400);
      await api.deposit(randomUUID(), 'USDx', '10').expect(404);
    });
  });

  describe('idempotency', () => {
    it('replays the original response and credits only once', async () => {
      const id = await api.createWallet();
      const key = randomUUID();

      const first = await api.deposit(id, 'USDx', '100', key).expect(201);
      const second = await api.deposit(id, 'USDx', '100', key).expect(200);

      expect(second.headers['idempotent-replayed']).toBe('true');
      expect(second.body).toEqual(first.body);
      expect((await api.balances(id)).USDx).toBe('100.00000000');

      const history = await api.http.get(`/wallets/${id}/transactions`).expect(200);
      expect(history.body.meta.total).toBe(1);
    });

    it('treats numerically equal amounts as the same request ("100" vs "100.00")', async () => {
      const id = await api.createWallet();
      const key = randomUUID();
      await api.deposit(id, 'USDx', '100', key).expect(201);
      await api.deposit(id, 'USDx', '100.00', key).expect(200);
    });

    it('rejects reuse of a key with a different body (422)', async () => {
      const id = await api.createWallet();
      const key = randomUUID();
      await api.deposit(id, 'USDx', '100', key).expect(201);
      const res = await api.deposit(id, 'USDx', '999', key).expect(422);
      expect(res.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
      expect((await api.balances(id)).USDx).toBe('100.00000000');
    });

    it('applies a key exactly once when the same request is fired concurrently', async () => {
      const id = await api.createWallet();
      const key = randomUUID();

      const results = await Promise.all(
        Array.from({ length: 6 }, () => api.deposit(id, 'USDx', '100', key)),
      );

      expect(results.every((r) => r.status === 200 || r.status === 201)).toBe(true);
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
      expect((await api.balances(id)).USDx).toBe('100.00000000');
    });

    it('scopes keys per wallet and operation', async () => {
      const a = await api.createWallet();
      const b = await api.createWallet();
      const key = randomUUID();
      await api.deposit(a, 'USDx', '10', key).expect(201);
      await api.deposit(b, 'USDx', '10', key).expect(201);
    });

    it('lets a client retry a failed request with the same key once the cause is fixed', async () => {
      const id = await api.createWallet();
      const key = randomUUID();
      await api.swap(id, 'cNGN', 'USDx', '1500', key).expect(422);
      await api.deposit(id, 'cNGN', '1500').expect(201);
      await api.swap(id, 'cNGN', 'USDx', '1500', key).expect(201);
    });
  });

  describe('swaps', () => {
    it('converts at the current FX rate and records the rate applied', async () => {
      const id = await api.createWallet();
      await api.deposit(id, 'cNGN', '3000').expect(201);

      const res = await api.swap(id, 'cNGN', 'USDx', '1500').expect(201);
      expect(res.body).toMatchObject({
        type: 'SWAP',
        senderWalletId: id,
        receiverWalletId: id,
        sourceCurrency: 'cNGN',
        sourceAmount: '1500.00000000',
        destCurrency: 'USDx',
        destAmount: '1.00000000',
        rate: '0.000666666666666667',
        rateSource: 'FIXED',
      });
      expect(await api.balances(id)).toMatchObject({
        cNGN: '1500.00000000',
        USDx: '1.00000000',
      });
    });

    it('rejects a swap that would make the balance negative and changes nothing', async () => {
      const id = await api.createWallet();
      await api.deposit(id, 'cNGN', '100').expect(201);

      const res = await api.swap(id, 'cNGN', 'USDx', '100.00000001').expect(422);
      expect(res.body.code).toBe('INSUFFICIENT_FUNDS');
      expect(await api.balances(id)).toMatchObject({ cNGN: '100.00000000', USDx: '0.00000000' });
      const history = await api.http.get(`/wallets/${id}/transactions`).expect(200);
      expect(history.body.meta.total).toBe(1); // only the deposit
    });

    it('rejects same-currency swaps and conversions that round to zero', async () => {
      const id = await api.createWallet();
      await api.deposit(id, 'cNGN', '1').expect(201);
      const same = await api.swap(id, 'cNGN', 'cNGN', '1').expect(400);
      expect(same.body.code).toBe('SAME_CURRENCY');
      const tiny = await api.swap(id, 'cNGN', 'USDx', '0.00000001').expect(422);
      expect(tiny.body.code).toBe('AMOUNT_TOO_SMALL');
    });

    it('never overdraws under concurrent swaps', async () => {
      const id = await api.createWallet();
      await api.deposit(id, 'USDx', '100').expect(201);

      const results = await Promise.all(
        Array.from({ length: 10 }, () => api.swap(id, 'USDx', 'cGHS', '30')),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(3);
      expect(results.filter((r) => r.status === 422)).toHaveLength(7);
      expect(await api.balances(id)).toMatchObject({
        USDx: '10.00000000',
        cGHS: '1125.00000000', // 3 x 30 x 12.5
      });
    });
  });

  describe('transfers', () => {
    it('moves funds between wallets in the same currency', async () => {
      const a = await api.createWallet();
      const b = await api.createWallet();
      await api.deposit(a, 'cNGN', '1000').expect(201);

      const res = await api
        .transfer({ fromWalletId: a, toWalletId: b, currency: 'cNGN', amount: '250.25' })
        .expect(201);
      expect(res.body).toMatchObject({
        type: 'TRANSFER',
        senderWalletId: a,
        receiverWalletId: b,
        sourceCurrency: 'cNGN',
        sourceAmount: '250.25000000',
        destCurrency: 'cNGN',
        destAmount: '250.25000000',
        rate: '1',
        rateSource: null,
      });
      expect((await api.balances(a)).cNGN).toBe('749.75000000');
      expect((await api.balances(b)).cNGN).toBe('250.25000000');
    });

    it('converts automatically when the currencies differ', async () => {
      const a = await api.createWallet();
      const b = await api.createWallet();
      await api.deposit(a, 'USDx', '100').expect(201);

      const res = await api
        .transfer({
          fromWalletId: a,
          toWalletId: b,
          currency: 'USDx',
          toCurrency: 'EURx',
          amount: '50',
        })
        .expect(201);
      expect(res.body).toMatchObject({
        sourceCurrency: 'USDx',
        sourceAmount: '50.00000000',
        destCurrency: 'EURx',
        destAmount: '46.00000000',
        rate: '0.92',
        rateSource: 'FIXED',
      });
      expect((await api.balances(a)).USDx).toBe('50.00000000');
      expect((await api.balances(b)).EURx).toBe('46.00000000');
    });

    it('rejects insufficient funds, self-transfers and unknown wallets without side effects', async () => {
      const a = await api.createWallet();
      const b = await api.createWallet();
      await api.deposit(a, 'USDx', '10').expect(201);

      const broke = await api
        .transfer({ fromWalletId: a, toWalletId: b, currency: 'USDx', amount: '10.00000001' })
        .expect(422);
      expect(broke.body.code).toBe('INSUFFICIENT_FUNDS');

      await api
        .transfer({ fromWalletId: a, toWalletId: a, currency: 'USDx', amount: '1' })
        .expect(400);

      await api
        .transfer({ fromWalletId: a, toWalletId: randomUUID(), currency: 'USDx', amount: '1' })
        .expect(404);
      await api
        .transfer({ fromWalletId: randomUUID(), toWalletId: b, currency: 'USDx', amount: '1' })
        .expect(404);

      expect((await api.balances(a)).USDx).toBe('10.00000000');
      expect((await api.balances(b)).USDx).toBe('0.00000000');
    });

    it('is idempotent', async () => {
      const a = await api.createWallet();
      const b = await api.createWallet();
      await api.deposit(a, 'USDx', '100').expect(201);
      const key = randomUUID();
      const body = { fromWalletId: a, toWalletId: b, currency: 'USDx', amount: '40' };

      const first = await api.transfer(body, key).expect(201);
      const replay = await api.transfer(body, key).expect(200);
      expect(replay.body).toEqual(first.body);
      expect((await api.balances(a)).USDx).toBe('60.00000000');
      expect((await api.balances(b)).USDx).toBe('40.00000000');
    });

    it('never overdraws the sender under concurrent transfers', async () => {
      const a = await api.createWallet();
      const b = await api.createWallet();
      await api.deposit(a, 'USDx', '100').expect(201);

      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          api.transfer({ fromWalletId: a, toWalletId: b, currency: 'USDx', amount: '30' }),
        ),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(3);
      expect(results.filter((r) => r.status === 422)).toHaveLength(7);
      expect((await api.balances(a)).USDx).toBe('10.00000000');
      expect((await api.balances(b)).USDx).toBe('90.00000000');
    });

    it('does not deadlock on simultaneous opposite transfers', async () => {
      const a = await api.createWallet();
      const b = await api.createWallet();
      await api.deposit(a, 'USDx', '1000').expect(201);
      await api.deposit(b, 'USDx', '1000').expect(201);

      const calls = Array.from({ length: 10 }, () => [
        api.transfer({ fromWalletId: a, toWalletId: b, currency: 'USDx', amount: '10' }),
        api.transfer({ fromWalletId: b, toWalletId: a, currency: 'USDx', amount: '10' }),
      ]).flat();
      const results = await Promise.all(calls);

      expect(results.every((r) => r.status === 201)).toBe(true);
      expect((await api.balances(a)).USDx).toBe('1000.00000000');
      expect((await api.balances(b)).USDx).toBe('1000.00000000');
    });
  });
});
