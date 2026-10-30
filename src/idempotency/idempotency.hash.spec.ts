import { hashRequest } from './idempotency.hash';

describe('hashRequest', () => {
  it('is independent of key order', () => {
    expect(hashRequest({ a: 1, b: { c: 2, d: 3 } })).toBe(hashRequest({ b: { d: 3, c: 2 }, a: 1 }));
  });

  it('changes when any value changes', () => {
    const base = hashRequest({ op: 'swap', amount: '10.00000000' });
    expect(hashRequest({ op: 'swap', amount: '10.00000001' })).not.toBe(base);
    expect(hashRequest({ op: 'deposit', amount: '10.00000000' })).not.toBe(base);
  });

  it('ignores undefined values', () => {
    expect(hashRequest({ a: 1, b: undefined })).toBe(hashRequest({ a: 1 }));
  });
});
