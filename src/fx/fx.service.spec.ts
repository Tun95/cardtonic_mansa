import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CURRENCIES } from '../common/currencies';
import { toDec } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import { FIXED_RATES_AS_OF } from './fx.constants';
import { FxService } from './fx.service';

const LIVE_BODY = {
  result: 'success',
  rates: { NGN: 1600, GHS: 16, XAF: 640, EUR: 0.8, USD: 1 },
};

function makeService(overrides: Record<string, unknown> = {}, storedRows: unknown[] = []) {
  const prisma = {
    fxRate: {
      findMany: jest.fn().mockResolvedValue(storedRows),
      upsert: jest.fn().mockResolvedValue(undefined),
    },
    $transaction: jest.fn().mockResolvedValue(undefined),
  };
  const config = {
    get: (key: string, fallback?: unknown) => overrides[key] ?? fallback,
  } as unknown as ConfigService;
  const service = new FxService(prisma as unknown as PrismaService, config);
  return { service, prisma };
}

const okResponse = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

describe('FxService', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('FX_PROVIDER=fixed never calls the network and reports FIXED', async () => {
    const { service } = makeService({ FX_PROVIDER: 'fixed' });
    const snap = await service.getSnapshot();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(snap.source).toBe('FIXED');
    expect(snap.refreshedAt).toEqual(FIXED_RATES_AS_OF);
    expect(service.quote(snap, 'cNGN', 'USDx').rate.toFixed(8)).toBe('0.00066667');
    expect(service.quote(snap, 'cGHS', 'USDx').rate.toFixed()).toBe('0.08');
  });

  it('uses live rates, persists them and caches within the TTL', async () => {
    fetchSpy.mockImplementation(() => okResponse(LIVE_BODY));
    const { service, prisma } = makeService();

    const first = await service.getSnapshot();
    const second = await service.getSnapshot();

    expect(first.source).toBe('LIVE');
    expect(second).toBe(first);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(prisma.fxRate.upsert).toHaveBeenCalledTimes(CURRENCIES.length);
    expect(service.quote(first, 'USDx', 'cNGN').rate.toFixed()).toBe('1600');
  });

  it('shares one in-flight request between concurrent callers', async () => {
    fetchSpy.mockImplementation(() => okResponse(LIVE_BODY));
    const { service } = makeService();
    await Promise.all([service.getSnapshot(), service.getSnapshot(), service.getSnapshot()]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to the fixed table when the provider fails and nothing is stored', async () => {
    fetchSpy.mockRejectedValue(new Error('network down'));
    const { service } = makeService();
    const snap = await service.getSnapshot();
    expect(snap.source).toBe('FIXED');
  });

  it('serves stored (STALE) rates, with their original timestamp, when the provider fails', async () => {
    fetchSpy.mockRejectedValue(new Error('timeout'));
    const refreshedAt = new Date('2026-10-28T08:00:00.000Z');
    const rows = [
      { currency: 'cNGN', perUsd: '1700', refreshedAt },
      { currency: 'cGHS', perUsd: '14', refreshedAt },
      { currency: 'cXAF', perUsd: '650', refreshedAt },
      { currency: 'USDx', perUsd: '1', refreshedAt },
      { currency: 'EURx', perUsd: '0.9', refreshedAt },
    ];
    const { service } = makeService({}, rows);
    const snap = await service.getSnapshot();
    expect(snap.source).toBe('STALE');
    expect(snap.refreshedAt).toEqual(refreshedAt);
    expect(service.quote(snap, 'USDx', 'cNGN').rate.toFixed()).toBe('1700');
  });

  it('keeps serving last-known live rates as STALE when a later refresh fails', async () => {
    fetchSpy.mockImplementationOnce(() => okResponse(LIVE_BODY));
    const { service } = makeService({ FX_CACHE_TTL_SECONDS: 0 });
    const live = await service.getSnapshot();

    fetchSpy.mockRejectedValue(new Error('provider 500'));
    const stale = await service.getSnapshot();
    expect(stale.source).toBe('STALE');
    expect(stale.refreshedAt).toEqual(live.refreshedAt);
    expect(stale.perUsd.cNGN.eq(1600)).toBe(true);
  });

  it('treats an incomplete or invalid payload as a failure', async () => {
    fetchSpy.mockImplementation(() =>
      okResponse({ result: 'success', rates: { NGN: 1600, GHS: -1, XAF: 640 } }),
    );
    const { service } = makeService();
    expect((await service.getSnapshot()).source).toBe('FIXED');
  });

  it('treats a non-2xx response as a failure and backs off instead of retrying every call', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.resolve({}),
    } as Response);
    const { service } = makeService();
    await service.getSnapshot();
    await service.getSnapshot();
    await service.getSnapshot();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('triangulates through USD so a->b and b->a are consistent', async () => {
    const { service } = makeService({ FX_PROVIDER: 'fixed' });
    const snap = await service.getSnapshot();
    for (const a of CURRENCIES) {
      for (const b of CURRENCIES) {
        const product = service.quote(snap, a, b).rate.mul(service.quote(snap, b, a).rate);
        expect(product.minus(1).abs().lt('1e-15')).toBe(true);
      }
    }
    expect(service.quote(snap, 'USDx', 'USDx').rate.eq(1)).toBe(true);
  });

  it('computes the USD equivalent of an amount', async () => {
    const { service } = makeService({ FX_PROVIDER: 'fixed' });
    const snap = await service.getSnapshot();
    expect(service.toUsd(snap, 'cNGN', toDec('1500')).toFixed(2)).toBe('1.00');
    expect(service.toUsd(snap, 'EURx', toDec('92')).toFixed(2)).toBe('100.00');
  });
});
