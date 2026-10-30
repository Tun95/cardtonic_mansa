import { randomUUID } from 'crypto';
import { TestApi, sleep } from './helpers';

describe('History and rates (e2e)', () => {
  let api: TestApi;
  beforeAll(async () => {
    api = await TestApi.create();
  });
  beforeEach(() => api.reset());
  afterAll(() => api.close());

  async function seedHistory() {
    const a = await api.createWallet();
    const b = await api.createWallet();
    const ids: string[] = [];
    const push = (res: { body: { id: string } }) => ids.push(res.body.id);

    push(await api.deposit(a, 'cNGN', '3000').expect(201));
    await sleep(5);
    push(await api.swap(a, 'cNGN', 'USDx', '1500').expect(201));
    await sleep(5);
    push(
      await api
        .transfer({ fromWalletId: a, toWalletId: b, currency: 'USDx', amount: '0.5' })
        .expect(201),
    );
    await sleep(5);
    push(
      await api
        .transfer({ fromWalletId: b, toWalletId: a, currency: 'USDx', amount: '0.1' })
        .expect(201),
    );
    return { a, b, ids };
  }

  it('lists transactions newest first with direction from the wallet perspective', async () => {
    const { a, ids } = await seedHistory();
    const res = await api.http.get(`/wallets/${a}/transactions`).expect(200);

    expect(res.body.data.map((t: { id: string }) => t.id)).toEqual([...ids].reverse());
    expect(res.body.data.map((t: { direction: string }) => t.direction)).toEqual([
      'received',
      'sent',
      'swap',
      'credit',
    ]);
    expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 4, totalPages: 1 });
  });

  it('shows a transfer to both parties, and only their own activity', async () => {
    const { b } = await seedHistory();
    const res = await api.http.get(`/wallets/${b}/transactions`).expect(200);
    expect(res.body.data.map((t: { direction: string }) => t.direction)).toEqual([
      'sent',
      'received',
    ]);
  });

  it('paginates', async () => {
    const { a, ids } = await seedHistory();
    const p1 = await api.http.get(`/wallets/${a}/transactions?limit=3&page=1`).expect(200);
    const p2 = await api.http.get(`/wallets/${a}/transactions?limit=3&page=2`).expect(200);
    expect(p1.body.data).toHaveLength(3);
    expect(p2.body.data.map((t: { id: string }) => t.id)).toEqual([ids[0]]);
    expect(p1.body.meta).toEqual({ page: 1, limit: 3, total: 4, totalPages: 2 });
  });

  it('filters by type and by currency (source or destination)', async () => {
    const { a } = await seedHistory();

    const swaps = await api.http.get(`/wallets/${a}/transactions?type=SWAP`).expect(200);
    expect(swaps.body.data).toHaveLength(1);
    expect(
      (await api.http.get(`/wallets/${a}/transactions?type=swap`).expect(200)).body.meta.total,
    ).toBe(1);

    const transfers = await api.http.get(`/wallets/${a}/transactions?type=TRANSFER`).expect(200);
    expect(transfers.body.data).toHaveLength(2);

    const cngn = await api.http.get(`/wallets/${a}/transactions?currency=cNGN`).expect(200);
    expect(cngn.body.data).toHaveLength(2); // deposit + swap (as source)
    const usdx = await api.http.get(`/wallets/${a}/transactions?currency=USDx`).expect(200);
    expect(usdx.body.data).toHaveLength(3); // swap (dest) + 2 transfers

    const both = await api.http
      .get(`/wallets/${a}/transactions?currency=USDx&type=TRANSFER`)
      .expect(200);
    expect(both.body.data).toHaveLength(2);
  });

  it('validates query parameters and the wallet', async () => {
    const id = await api.createWallet();
    await api.http.get(`/wallets/${id}/transactions?type=REFUND`).expect(400);
    await api.http.get(`/wallets/${id}/transactions?currency=BTC`).expect(400);
    await api.http.get(`/wallets/${id}/transactions?limit=1000`).expect(400);
    await api.http.get(`/wallets/${id}/transactions?page=0`).expect(400);
    await api.http.get(`/wallets/${randomUUID()}/transactions`).expect(404);
  });

  it('fetches a single transaction by id', async () => {
    const { ids } = await seedHistory();
    const res = await api.http.get(`/transactions/${ids[1]}`).expect(200);
    expect(res.body).toMatchObject({ id: ids[1], type: 'SWAP', destAmount: '1.00000000' });
    await api.http.get(`/transactions/${randomUUID()}`).expect(404);
    await api.http.get('/transactions/nope').expect(400);
  });

  describe('GET /fx/rates', () => {
    it('returns every ordered pair with source and refresh time', async () => {
      const res = await api.http.get('/fx/rates').expect(200);
      expect(res.body.source).toBe('FIXED');
      expect(res.body.rates).toHaveLength(20); // 5 x 4
      const usdToNgn = res.body.rates.find(
        (r: { from: string; to: string }) => r.from === 'USDx' && r.to === 'cNGN',
      );
      expect(usdToNgn).toMatchObject({ rate: '1500', source: 'FIXED' });
      expect(new Date(usdToNgn.refreshedAt).toString()).not.toBe('Invalid Date');
    });

    it('can be limited to one base currency', async () => {
      const res = await api.http.get('/fx/rates?base=cNGN').expect(200);
      expect(res.body.rates).toHaveLength(4);
      expect(res.body.rates.every((r: { from: string }) => r.from === 'cNGN')).toBe(true);
      await api.http.get('/fx/rates?base=BTC').expect(400);
    });
  });

  it('GET /health reports database connectivity', async () => {
    const res = await api.http.get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', db: 'up' });
  });
});
