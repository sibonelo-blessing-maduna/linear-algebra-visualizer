import { describe, expect, it } from 'vitest';
import { Fraction } from '../../math/fraction';
import type { Rows } from '../../math/notation';
import { charPoly, eigenvalues, formatPoly } from './math';
import { traceEigen } from './algorithm';

const rows = (r: number[][]): Rows => r.map((row) => row.map((v) => new Fraction(v)));
const summary = (A: number[][]) => {
  const t = traceEigen(rows(A));
  return t.pairs.map((p) => `${p.lambda.label}${p.lambda.multiplicity > 1 ? `×${p.lambda.multiplicity}` : ''}: ${p.display.join(' ')}`);
};

describe('characteristic polynomial', () => {
  it('expands det(A − λI)', () => {
    expect(formatPoly(charPoly(rows([[2, 1], [1, 2]])))).toBe('λ² − 4λ + 3');
    expect(formatPoly(charPoly(rows([[4, 1, 0], [0, 3, 1], [0, 0, 2]])))).toBe('−λ³ + 9λ² − 26λ + 24');
  });
});

describe('eigenvalues', () => {
  it('finds rational, irrational and complex roots', () => {
    expect(eigenvalues(charPoly(rows([[2, 1], [1, 2]]))).real.map((r) => r.label)).toEqual(['3', '1']);
    const irr = eigenvalues(charPoly(rows([[2, 1], [1, 1]])));
    expect(irr.real.map((r) => r.label)).toEqual(['(3 + √5)/2 ≈ 2.618', '(3 − √5)/2 ≈ 0.382']);
    const rot = eigenvalues(charPoly(rows([[0, -1], [1, 0]])));
    expect(rot.real).toEqual([]);
    expect(rot.complex).toEqual(['± i']);
    const rotZ = eigenvalues(charPoly(rows([[0, -1, 0], [1, 0, 0], [0, 0, 1]])));
    expect(rotZ.real.map((r) => r.label)).toEqual(['1']);
    expect(rotZ.complex).toEqual(['± i']);
  });

  it('solves an irreducible cubic numerically', () => {
    // p(λ) = −λ³ + 3λ² − 3 has no rational roots.
    const A = [[2, 1, 0], [1, 0, 1], [0, 1, 1]];
    const { real } = eigenvalues(charPoly(rows(A)));
    expect(real.length).toBe(3);
    expect(real.reduce((s, r) => s + r.value, 0)).toBeCloseTo(3, 9); // sum of eigenvalues = trace
    for (const r of real) expect(Math.abs(det3(A, r.value))).toBeLessThan(1e-9);
  });
});

function det3(A: number[][], l: number): number {
  const M = A.map((r, i) => r.map((v, j) => (i === j ? v - l : v)));
  return M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
}

describe('traceEigen', () => {
  it('finds eigenvectors as small integer vectors', () => {
    expect(summary([[2, 1], [1, 2]])).toEqual(['3: (1, 1)', '1: (1, −1)']);
    expect(summary([[4, 1, 0], [0, 3, 1], [0, 0, 2]])).toEqual(['4: (1, 0, 0)', '3: (1, −1, 0)', '2: (1, −2, 2)']);
  });

  it('handles eigenplanes, defective and rotation matrices', () => {
    expect(summary([[2, 1, 0], [1, 2, 0], [0, 0, 3]])).toEqual(['3×2: (1, 1, 0) (0, 0, 1)', '1: (1, −1, 0)']);
    expect(traceEigen(rows([[2, 1, 0], [1, 2, 0], [0, 0, 3]])).diagonalizable).toBe(true);
    const shear = traceEigen(rows([[1, 1], [0, 1]]));
    expect(summary([[1, 1], [0, 1]])).toEqual(['1×2: (1, 0)']);
    expect(shear.diagonalizable).toBe(false);
    const rot = traceEigen(rows([[0, -1], [1, 0]]));
    expect(rot.pairs).toEqual([]);
    expect(rot.steps[rot.steps.length - 1].note).toContain('no real roots');
  });

  it('gives unit-length numeric eigenvectors for irrational λ that satisfy Av = λv', () => {
    const t = traceEigen(rows([[2, 1], [1, 1]]));
    for (const p of t.pairs) {
      const v = p.vectors[0];
      expect(Math.hypot(...v)).toBeCloseTo(1, 9);
      expect(2 * v[0] + v[1]).toBeCloseTo(p.lambda.value * v[0], 9);
      expect(v[0] + v[1]).toBeCloseTo(p.lambda.value * v[1], 9);
    }
  });
});

describe('formatPoly', () => {
  it('matches the cubic used in the numeric test', () => {
    expect(formatPoly(charPoly(rows([[2, 1, 0], [1, 0, 1], [0, 1, 1]])))).toBe('−λ³ + 3λ² − 3');
  });
});
