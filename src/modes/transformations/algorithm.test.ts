import { describe, expect, it } from 'vitest';
import { Fraction } from '../../math/fraction';
import type { Rows } from '../../math/notation';
import { determinant, traceTransformation } from './algorithm';

const rows = (r: (number | [number, number])[][]): Rows =>
  r.map((row) => row.map((v) => (Array.isArray(v) ? new Fraction(v[0], v[1]) : new Fraction(v))));

describe('determinant', () => {
  it('handles 2×2 and 3×3 matrices exactly', () => {
    expect(determinant(rows([[1, 2], [3, 4]])).value.format()).toBe('−2');
    expect(determinant(rows([[2, 0, 0], [0, [1, 2], 0], [0, 0, [3, 2]]])).value.format()).toBe('3/2');
    expect(determinant(rows([[1, 0, 1], [0, 1, 1], [0, 0, 0]])).value.isZero()).toBe(true);
    expect(determinant(rows([[1, 1, 0], [0, 1, 1], [1, 0, 1]])).value.format()).toBe('2');
  });
});

describe('traceTransformation', () => {
  it('computes Av and ends with the grid at A', () => {
    const trace = traceTransformation(rows([[1, -1, 2], [1, 2, 1]]));
    expect(trace.Av.map((f) => f.format())).toEqual(['1', '4']);
    expect(trace.det.format()).toBe('3');
    const last = trace.steps[trace.steps.length - 1];
    expect(last.matrix).toEqual([[1, -1], [1, 2]]);
    expect(last.line).toBe(trace.code.length - 1);
  });

  it('moves one basis vector per step, starting from the identity', () => {
    const trace = traceTransformation(rows([[0, -1, 0, 2], [1, 0, 0, 1], [0, 0, 1, 1]]));
    const moves = trace.steps.filter((s) => s.movesGrid);
    expect(moves.map((s) => s.matrix)).toEqual([
      [[0, 0, 0], [1, 1, 0], [0, 0, 1]],
      [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
      [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    ]);
    expect(trace.steps[0].matrix).toEqual([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
    expect(trace.Av.map((f) => f.format())).toEqual(['−1', '2', '1']);
  });

  it('visits every pseudocode line and computes each row of Av', () => {
    const trace = traceTransformation(rows([[2, 0, 1], [0, [1, 2], 2]]));
    const visited = new Set(trace.steps.map((s) => s.line));
    expect(visited.size).toBe(trace.code.length);
    const rowSteps = trace.steps.filter((s) => s.projectRow !== undefined);
    expect(rowSteps.map((s) => s.calc[0])).toEqual(['(Av)_1 = 2·1 + 0·2 = 2', '(Av)_2 = 0·1 + (1/2)·2 = 1']);
  });
});
