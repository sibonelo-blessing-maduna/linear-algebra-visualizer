import { Fraction } from '../../math/fraction';
import type { Rows } from '../../math/notation';
import { BASIS_NAMES, determinant } from '../transformations/algorithm';

export function multiply(A: Rows, B: Rows): Rows {
  const n = A.length;
  return A.map((row) =>
    Array.from({ length: n }, (_, j) => row.reduce((s, a, k) => s.add(a.mul(B[k][j])), Fraction.ZERO)),
  );
}

const equal = (X: Rows, Y: Rows) => X.every((row, i) => row.every((f, j) => f.equals(Y[i][j])));
const col = (M: Rows, j: number) => M.map((r) => r[j]);
const vec = (xs: Fraction[]) => `(${xs.map((f) => f.format()).join(', ')})`;
const mat = (M: Rows) => `[${M.map((r) => r.map((f) => f.format()).join(' ')).join(' ; ')}]`;

export const LINES = { start: 0, applyB: 1, applyA: 2, loopJ: 3, column: 4, loopI: 5, entry: 6, det: 7, ret: 8 };

export function pseudocode(n: number): string[] {
  const basis = BASIS_NAMES.slice(0, n).join(', ');
  const note = (code: string, comment: string) => `${code.padEnd(28)}▹ ${comment}`;
  return [
    note('procedure Multiply(A, B):', 'AB = first B, then A'),
    note('  space ← B(space)', `${basis} land on B's columns`),
    note('  space ← A(space)', "… then on AB's columns"),
    '  for j ← 1 to n:',
    '    column j of AB ← A · (column j of B)',
    '    for i ← 1 to n:',
    '      (AB)_ij ← (row i of A) · (column j of B)',
    '  det(AB) ← det A · det B',
    '  return AB',
  ];
}

/** How the grid moves during a step. */
export type Motion = 'applyB' | 'applyA' | null;

export interface Step {
  line: number;
  /** Which composite is drawn once the step is done. */
  stage: 'identity' | 'B' | 'AB';
  motion: Motion;
  /** Column j of AB being built as Σ_k B_kj · (column k of A). */
  buildColumn?: number;
  /** Grow the column's head-to-tail path during this step. */
  growColumn: boolean;
  projectRow?: number;
  showDet: boolean;
  /** Table highlights. */
  focusRow?: number;
  focusCol?: number;
  /** Columns of AB computed so far. */
  revealedCols: number;
  vars: Record<string, string>;
  note: string;
  calc: string[];
}

export interface Trace {
  steps: Step[];
  code: string[];
  A: Rows;
  B: Rows;
  AB: Rows;
  BA: Rows;
  detA: Fraction;
  detB: Fraction;
}

/** Records every pseudocode line of computing AB, like a step-through debugger. */
export function traceMultiplication(input: Rows): Trace {
  const n = input.length;
  const A = input.map((r) => r.slice(0, n));
  const B = input.map((r) => r.slice(n, 2 * n));
  const AB = multiply(A, B);
  const BA = multiply(B, A);
  const detA = determinant(A).value;
  const detB = determinant(B).value;
  const basis = BASIS_NAMES.slice(0, n);
  const measure = n === 2 ? 'area' : 'volume';

  const steps: Step[] = [];
  const vars: Record<string, string> = {};
  let stage: Step['stage'] = 'identity';
  let revealedCols = 0;

  const emit = (line: number, note: string, extra: Partial<Step> = {}) =>
    steps.push({
      line,
      stage,
      motion: null,
      growColumn: false,
      showDet: false,
      revealedCols,
      vars: { ...vars },
      note,
      calc: [],
      ...extra,
    });

  emit(LINES.start, 'AB means "first apply B, then apply A", read right to left like f(g(x)). Multiplying matrices composes their transformations.');

  stage = 'B';
  emit(LINES.applyB, `B moves ${basis.map((b, j) => `${b} to its column ${j + 1}`).join(', ')}, and the whole grid follows.`, {
    motion: 'applyB',
    calc: basis.map((b, j) => `${b} → ${vec(col(B, j))}`),
  });

  stage = 'AB';
  emit(
    LINES.applyA,
    `Now A acts on space that B has already moved. Every point is carried along, including the tips of B's columns (the faint arrows show where B left them).`,
    {
      motion: 'applyA',
      calc: [...basis.map((b, j) => `${b} → ${vec(col(B, j))} → ${vec(col(AB, j))}`)],
    },
  );

  for (let j = 0; j < n; j++) {
    vars.j = String(j + 1);
    delete vars.i;
    emit(LINES.loopJ, `j = ${j + 1}: where does ${basis[j]} end up after both moves?`, { focusCol: j, buildColumn: j });

    revealedCols = j + 1;
    const bj = col(B, j);
    const terms = bj.map((b, k) => `${b.formatFactor()}·${vec(col(A, k))}`).join(' + ');
    emit(
      LINES.column,
      `B sent ${basis[j]} to ${vec(bj)}: that's a recipe, "${bj.map((b, k) => `${b.format()} of ${basis[k]}`).join(', ')}". A moves each ${basis.join('/')} to its own column, so follow the same recipe along A's columns.`,
      {
        focusCol: j,
        buildColumn: j,
        growColumn: true,
        calc: [`A·${vec(bj)} = ${terms}`, `       = ${vec(col(AB, j))}`],
      },
    );

    for (let i = 0; i < n; i++) {
      vars.i = String(i + 1);
      emit(LINES.loopI, `i = ${i + 1}: entry ${i + 1} of this column, another way.`, { focusCol: j, focusRow: i, buildColumn: j });
      const dot = A[i].map((a, k) => `${a.formatFactor()}·${B[k][j].formatFactor()}`).join(' + ');
      emit(LINES.entry, `Row ${i + 1} of A dotted with column ${j + 1} of B gives the same number.`, {
        focusCol: j,
        focusRow: i,
        buildColumn: j,
        projectRow: i,
        calc: [`(AB)_${i + 1}${j + 1} = ${dot} = ${AB[i][j].format()}`],
      });
    }
  }
  for (const k of Object.keys(vars)) delete vars[k];

  const detAB = detA.mul(detB);
  emit(
    LINES.det,
    `B scales every ${measure} by ${detB.format()}, then A scales the result by ${detA.format()}, so together they scale it by ${detA.format()} × ${detB.format()} = ${detAB.format()}.` +
      (detAB.isZero() ? ` A factor of 0 means space was flattened somewhere along the way, and no later step can undo that.` : ''),
    {
      showDet: true,
      calc: [`det A = ${detA.format()},  det B = ${detB.format()}`, `det(AB) = ${detA.formatFactor()}·${detB.formatFactor()} = ${detAB.format()}`],
    },
  );

  const same = equal(AB, BA);
  emit(
    LINES.ret,
    same
      ? 'Here BA happens to equal AB, so the order doesn\'t matter for these two. That\'s the exception, not the rule.'
      : 'Doing them in the other order (BA: first A, then B) gives a different matrix. Order matters: try the matching "then" example the other way round.',
    { calc: [`AB = ${mat(AB)}`, `BA = ${mat(BA)}${same ? '  (same)' : '  (different)'}`] },
  );

  return { steps, code: pseudocode(n), A, B, AB, BA, detA, detB };
}
