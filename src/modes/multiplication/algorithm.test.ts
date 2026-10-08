import { describe, expect, it } from 'vitest';
import { Fraction } from '../../math/fraction';
import type { Rows } from '../../math/notation';
import { LINES, multiply, traceMultiplication } from './algorithm';

const rows = (r: (number | [number, number])[][]): Rows =>
  r.map((row) => row.map((v) => (Array.isArray(v) ? new Fraction(v[0], v[1]) : new Fraction(v))));
const fmt = (M: Rows) => M.map((r) => r.map((f) => f.format()));

const ROT = [[0, -1], [1, 0]];
const SHEAR = [[1, 1], [0, 1]];
/** [A | B] input rows. */
type Entry = number | [number, number];
const input = (A: Entry[][], B: Entry[][]) => rows(A.map((r, i) => [...r, ...B[i]]));

describe('multiply', () => {
  it('composes "first B, then A"', () => {
    // Rotate (1, 0) to (0, 1), then shear: (0, 1) → (1, 1).
    expect(fmt(multiply(rows(SHEAR), rows(ROT)))).toEqual([['1', '−1'], ['1', '0']]);
    expect(fmt(multiply(rows(ROT), rows(SHEAR)))).toEqual([['0', '−1'], ['1', '1']]);
  });
});

describe('traceMultiplication', () => {
  it('reports AB, BA and det(AB) = det A · det B', () => {
    const trace = traceMultiplication(input(SHEAR, ROT));
    expect(fmt(trace.AB)).toEqual([['1', '−1'], ['1', '0']]);
    expect(fmt(trace.BA)).toEqual([['0', '−1'], ['1', '1']]);
    const det = trace.steps.find((s) => s.line === LINES.det)!;
    expect(det.calc[1]).toBe('det(AB) = 1·1 = 1');
    expect(trace.steps[trace.steps.length - 1].calc[1]).toContain('(different)');
  });

  it('notices when the order does not matter', () => {
    const trace = traceMultiplication(input(ROT, ROT));
    expect(fmt(trace.AB)).toEqual([['−1', '0'], ['0', '−1']]);
    expect(trace.steps[trace.steps.length - 1].calc[1]).toContain('(same)');
  });

  it('moves the grid through B before A and computes every entry', () => {
    const trace = traceMultiplication(input([[1, -1], [1, 2]], [[2, 1], [0, [1, 2]]]));
    expect(trace.steps.filter((s) => s.motion).map((s) => s.motion)).toEqual(['applyB', 'applyA']);
    const entries = trace.steps.filter((s) => s.line === LINES.entry).map((s) => s.calc[0]);
    expect(entries).toEqual([
      '(AB)_11 = 1·2 + (−1)·0 = 2',
      '(AB)_21 = 1·2 + 2·0 = 2',
      '(AB)_12 = 1·1 + (−1)·(1/2) = 1/2',
      '(AB)_22 = 1·1 + 2·(1/2) = 2',
    ]);
    expect(new Set(trace.steps.map((s) => s.line)).size).toBe(trace.code.length);
  });
});
