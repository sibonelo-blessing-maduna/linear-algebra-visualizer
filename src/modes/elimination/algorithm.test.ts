import { describe, expect, it } from 'vitest';
import { Fraction } from '../../math/fraction';
import { PSEUDOCODE, formatEquation, traceElimination, type Rows } from './algorithm';

const sys = (rows: number[][]): Rows => rows.map((r) => r.map((v) => new Fraction(v)));

/** Every row of `rows` is satisfied by x. */
function satisfies(rows: Rows, x: Fraction[]): boolean {
  const n = x.length;
  return rows.every((row) => row.slice(0, n).reduce((s, a, k) => s.add(a.mul(x[k])), Fraction.ZERO).equals(row[n]));
}

describe('Fraction', () => {
  it('parses integers, fractions and decimals', () => {
    expect(Fraction.parse('-3')?.format()).toBe('−3');
    expect(Fraction.parse('6/4')?.format()).toBe('3/2');
    expect(Fraction.parse('0.25')?.format()).toBe('1/4');
    expect(Fraction.parse('-.5')?.format()).toBe('−1/2');
    expect(Fraction.parse('abc')).toBeNull();
    expect(Fraction.parse('1/0')).toBeNull();
    expect(Fraction.parse('')).toBeNull();
  });

  it('normalises sign and -0', () => {
    expect(new Fraction(2, -4).format()).toBe('−1/2');
    expect(new Fraction(0, -3).isZero()).toBe(true);
    expect(new Fraction(-0).format()).toBe('0');
  });
});

describe('traceElimination', () => {
  it('solves a 2×2 system and keeps the solution at every step', () => {
    const { steps, outcome } = traceElimination(sys([[2, 1, 5], [1, -1, 1]]));
    expect(outcome.kind).toBe('unique');
    if (outcome.kind !== 'unique') return;
    expect(outcome.x.map((f) => f.format())).toEqual(['2', '1']);
    for (const s of steps) expect(satisfies(s.rows, outcome.x)).toBe(true);
  });

  it('solves the classic 3×3 system', () => {
    const { steps, outcome } = traceElimination(sys([[2, 1, -1, 8], [-3, -1, 2, -11], [-2, 1, 2, -3]]));
    expect(outcome.kind === 'unique' && outcome.x.map((f) => f.format())).toEqual(['2', '3', '−1']);
    const last = steps[steps.length - 1];
    expect(last.line).toBe(PSEUDOCODE.length - 1);
    expect(last.rows.map(formatEquation)).toEqual(['x = 2', 'y = 3', 'z = −1']);
  });

  it('swaps rows when the pivot is zero and tracks equation identity', () => {
    const { steps, outcome } = traceElimination(sys([[0, 1, 1, 5], [1, 1, 1, 6], [2, 1, -1, 1]]));
    expect(outcome.kind === 'unique' && outcome.x.map((f) => f.format())).toEqual(['1', '2', '3']);
    const swap = steps.find((s) => s.op?.kind === 'swap');
    expect(swap?.op).toEqual({ kind: 'swap', a: 0, b: 1 });
    expect(swap?.order).toEqual([1, 0, 2]);
  });

  it('reports infinitely many solutions with a parametric description', () => {
    const { outcome } = traceElimination(sys([[1, 1, 1, 3], [1, 2, 3, 6], [2, 3, 4, 9]]));
    expect(outcome.kind).toBe('infinite');
    if (outcome.kind !== 'infinite') return;
    expect(outcome.free).toEqual([2]);
    expect(outcome.description).toBe('x = z, y = 3 − 2z; z free');
  });

  it('stops at the consistency check when there is no solution', () => {
    const { steps, outcome } = traceElimination(sys([[1, 2, 3], [2, 4, 5]]));
    expect(outcome).toEqual({ kind: 'none', row: 1 });
    expect(steps[steps.length - 1].line).toBe(10);
  });

  it('only marks steps as operations when the matrix actually changed', () => {
    const { steps } = traceElimination(sys([[2, 1, -1, 8], [-3, -1, 2, -11], [-2, 1, 2, -3]]));
    for (let k = 1; k < steps.length; k++) {
      const changed = steps[k].rows.some((row, i) => row.some((f, j) => !f.equals(steps[k - 1].rows[i][j])));
      expect(changed).toBe(steps[k].op !== undefined);
    }
  });
});
