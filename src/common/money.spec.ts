import { convertAmount } from './convert';
import { D, fmtAmount, fmtRate, roundAmount, toDec } from './money';

describe('money', () => {
  it('has no binary floating point error', () => {
    expect(new D('0.1').plus('0.2').toString()).toBe('0.3');
    expect(fmtAmount(toDec('0.1').plus('0.2'))).toBe('0.30000000');
  });

  it('rounds half-even to 8 decimal places', () => {
    expect(roundAmount(toDec('1.000000005')).toFixed(8)).toBe('1.00000000');
    expect(roundAmount(toDec('1.000000015')).toFixed(8)).toBe('1.00000002');
    expect(roundAmount(toDec('1.000000016')).toFixed(8)).toBe('1.00000002');
  });

  it('formats rates without exponent or trailing zeros', () => {
    expect(fmtRate('0.00066666666666666700')).toBe('0.000666666666666667');
    expect(fmtRate('1')).toBe('1');
  });

  it('rejects conversions that round to zero', () => {
    expect(() => convertAmount(toDec('0.00000001'), toDec('0.0001'))).toThrow(/converts to zero/);
    expect(convertAmount(toDec('1500'), toDec('0.000666666666666667')).toFixed(8)).toBe(
      '1.00000000',
    );
  });
});
