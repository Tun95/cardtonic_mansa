import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CURRENCIES, CurrencyCode } from '../common/currencies';
import { D, Dec, roundRate, toDec } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import { FIXED_PER_USD, FIXED_RATES_AS_OF, PEGGED_FIAT } from './fx.constants';
import { FxQuote, FxSnapshot } from './fx.types';

/**
 * FX rates, triangulated through USD so that rate(a,b) * rate(b,a) == 1 and any pair is consistent.
 *
 * Resolution order on every refresh:
 *   1. LIVE   - public provider (cached for FX_CACHE_TTL_SECONDS, one in-flight request at a time)
 *   2. STALE  - last live rates (in memory, else the FxRate table written by a previous refresh)
 *   3. FIXED  - built-in table
 * After a failure we serve the degraded snapshot for FX_FAILURE_BACKOFF_SECONDS before retrying,
 * so a provider outage never adds latency to every request.
 */
@Injectable()
export class FxService {
  private readonly logger = new Logger(FxService.name);
  private readonly provider: 'live' | 'fixed';
  private readonly url: string;
  private readonly ttlMs: number;
  private readonly backoffMs: number;
  private readonly timeoutMs: number;

  private cache: FxSnapshot | null = null;
  private cacheExpiresAt = 0;
  private lastLive: FxSnapshot | null = null;
  private inflight: Promise<FxSnapshot> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.provider = config.get<string>('FX_PROVIDER', 'live') === 'fixed' ? 'fixed' : 'live';
    this.url = config.get<string>('FX_PROVIDER_URL', 'https://open.er-api.com/v6/latest/USD');
    this.ttlMs = Number(config.get('FX_CACHE_TTL_SECONDS', 300)) * 1000;
    this.backoffMs = Number(config.get('FX_FAILURE_BACKOFF_SECONDS', 30)) * 1000;
    this.timeoutMs = Number(config.get('FX_REQUEST_TIMEOUT_MS', 4000));
  }

  async getSnapshot(): Promise<FxSnapshot> {
    if (this.cache && Date.now() < this.cacheExpiresAt) return this.cache;
    if (!this.inflight) {
      this.inflight = this.refresh().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  async getRate(from: CurrencyCode, to: CurrencyCode): Promise<FxQuote> {
    const snapshot = await this.getSnapshot();
    return this.quote(snapshot, from, to);
  }

  quote(snapshot: FxSnapshot, from: CurrencyCode, to: CurrencyCode): FxQuote {
    const rate = from === to ? new D(1) : roundRate(snapshot.perUsd[to].div(snapshot.perUsd[from]));
    return { from, to, rate, source: snapshot.source, refreshedAt: snapshot.refreshedAt };
  }

  /** Value of `amount` of `currency`, in USD. */
  toUsd(snapshot: FxSnapshot, currency: CurrencyCode, amount: Dec): Dec {
    return amount.div(snapshot.perUsd[currency]);
  }

  async listRates(base?: CurrencyCode): Promise<{ snapshot: FxSnapshot; quotes: FxQuote[] }> {
    const snapshot = await this.getSnapshot();
    const quotes: FxQuote[] = [];
    for (const from of base ? [base] : CURRENCIES) {
      for (const to of CURRENCIES) {
        if (from !== to) quotes.push(this.quote(snapshot, from, to));
      }
    }
    return { snapshot, quotes };
  }

  // ---------------------------------------------------------------------------------------------

  private async refresh(): Promise<FxSnapshot> {
    if (this.provider === 'fixed') {
      return this.remember(this.fixedSnapshot(), this.ttlMs);
    }
    try {
      const snapshot: FxSnapshot = {
        perUsd: await this.fetchLive(),
        source: 'LIVE',
        refreshedAt: new Date(),
      };
      this.lastLive = snapshot;
      await this.persist(snapshot);
      return this.remember(snapshot, this.ttlMs);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      const degraded = await this.degraded();
      this.logger.warn(
        `Live FX refresh failed (${reason}); serving ${degraded.source} rates for ${this.backoffMs / 1000}s`,
      );
      return this.remember(degraded, this.backoffMs);
    }
  }

  private remember(snapshot: FxSnapshot, ttlMs: number): FxSnapshot {
    this.cache = snapshot;
    this.cacheExpiresAt = Date.now() + ttlMs;
    return snapshot;
  }

  private async fetchLive(): Promise<Record<CurrencyCode, Dec>> {
    const res = await fetch(this.url, { signal: AbortSignal.timeout(this.timeoutMs) });
    if (!res.ok) throw new Error(`provider responded HTTP ${res.status}`);

    const body = (await res.json()) as { result?: string; rates?: Record<string, unknown> };
    if (body.result !== undefined && body.result !== 'success') {
      throw new Error(`provider result "${body.result}"`);
    }

    const perUsd = {} as Record<CurrencyCode, Dec>;
    for (const currency of CURRENCIES) {
      const fiat = PEGGED_FIAT[currency];
      const value = fiat === 'USD' ? 1 : body.rates?.[fiat];
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new Error(`missing or invalid rate for ${fiat}`);
      }
      perUsd[currency] = new D(value);
    }
    return perUsd;
  }

  private async degraded(): Promise<FxSnapshot> {
    if (this.lastLive) return { ...this.lastLive, source: 'STALE' };
    const stored = await this.loadStored();
    return stored ?? this.fixedSnapshot();
  }

  private fixedSnapshot(): FxSnapshot {
    const perUsd = {} as Record<CurrencyCode, Dec>;
    for (const currency of CURRENCIES) perUsd[currency] = new D(FIXED_PER_USD[currency]);
    return { perUsd, source: 'FIXED', refreshedAt: FIXED_RATES_AS_OF };
  }

  private async persist(snapshot: FxSnapshot): Promise<void> {
    try {
      await this.prisma.$transaction(
        CURRENCIES.map((currency) =>
          this.prisma.fxRate.upsert({
            where: { currency },
            create: {
              currency,
              perUsd: snapshot.perUsd[currency].toFixed(),
              source: 'LIVE',
              refreshedAt: snapshot.refreshedAt,
            },
            update: {
              perUsd: snapshot.perUsd[currency].toFixed(),
              source: 'LIVE',
              refreshedAt: snapshot.refreshedAt,
            },
          }),
        ),
      );
    } catch (err) {
      this.logger.warn(`Could not persist FX rates: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async loadStored(): Promise<FxSnapshot | null> {
    try {
      const rows = await this.prisma.fxRate.findMany();
      const perUsd = {} as Record<CurrencyCode, Dec>;
      for (const currency of CURRENCIES) {
        const row = rows.find((r) => r.currency === currency);
        if (!row) return null;
        perUsd[currency] = toDec(row.perUsd);
      }
      const refreshedAt = new Date(Math.min(...rows.map((r) => r.refreshedAt.getTime())));
      return { perUsd, source: 'STALE', refreshedAt };
    } catch {
      return null;
    }
  }
}
