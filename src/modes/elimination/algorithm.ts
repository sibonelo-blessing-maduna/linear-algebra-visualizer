import { Fraction } from '../../math/fraction';

export type Rows = Fraction[][];

/** The pseudocode shown in the interpreter panel. Each trace step points at one of these lines. */
export const PSEUDOCODE = [
  'procedure Solve([A | b]):',
  '  r ← 1',
  '  for c ← 1 to n:',
  '    p ← first row ≥ r with A[p,c] ≠ 0',
  '    if no such p: continue',
  '    if p ≠ r: swap R_r ↔ R_p',
  '    for i ← r+1 to n:',
  '      m ← A[i,c] / A[r,c]',
  '      R_i ← R_i − m·R_r',
  '    r ← r + 1',
  '  if some row is [0 … 0 | d], d ≠ 0: return "no solution"',
  '  for each pivot (r, c), last to first:',
  '    R_r ← R_r / A[r,c]',
  '    for i ← 1 to r − 1:',
  '      R_i ← R_i − A[i,c]·R_r',
  '  return x',
];

export const FORWARD_END_LINE = 9;
export const BACK_START_LINE = 11;

export type RowOp =
  /** Swap the rows at positions a and b. */
  | { kind: 'swap'; a: number; b: number }
  /** R_row ← R_row / divisor */
  | { kind: 'scale'; row: number; divisor: Fraction }
  /** R_target ← R_target − factor·R_source, which zeroes column `col` of the target row. */
  | { kind: 'replace'; target: number; source: number; factor: Fraction; col: number };

export interface Step {
  /** Index into PSEUDOCODE. */
  line: number;
  /** Augmented matrix after this line ran. */
  rows: Rows;
  /** order[k] = which original equation now sits at row k (equations keep their colour through swaps). */
  order: number[];
  /** The row operation this line performed, if it changed the matrix. */
  op?: RowOp;
  pivot?: [number, number];
  /** Rows (by position) the line is reading or writing. */
  focusRows: number[];
  focusCol?: number;
  vars: Record<string, string>;
  note: string;
  calc: string[];
}

export type Outcome =
  | { kind: 'unique'; x: Fraction[] }
  | { kind: 'infinite'; free: number[]; description: string }
  | { kind: 'none'; row: number };

export const VAR_NAMES = ['x', 'y', 'z'];

export function formatRow(row: Fraction[]): string {
  const coeffs = row.slice(0, -1).map((f) => f.format());
  return `[${coeffs.join(', ')} | ${row[row.length - 1].format()}]`;
}

/** "2x − y + (1/2)z = 3" */
export function formatEquation(row: Fraction[]): string {
  const n = row.length - 1;
  let lhs = '';
  for (let c = 0; c < n; c++) {
    const a = row[c];
    if (a.isZero()) continue;
    const mag = a.abs();
    const coef = mag.isOne() ? '' : mag.d === 1 ? mag.format() : `(${mag.format()})`;
    const sign = a.isNegative() ? (lhs ? ' − ' : '−') : lhs ? ' + ' : '';
    lhs += `${sign}${coef}${VAR_NAMES[c]}`;
  }
  return `${lhs || '0'} = ${row[n].format()}`;
}

const isZeroRow = (row: Fraction[]) => row.slice(0, -1).every((f) => f.isZero());

/**
 * Runs Gauss–Jordan elimination on an n×(n+1) augmented matrix and records every
 * pseudocode line it executes, like a step-through debugger.
 */
export function traceElimination(input: Rows): { steps: Step[]; outcome: Outcome } {
  const n = input.length;
  const rows = input.map((r) => r.slice());
  const order = rows.map((_, i) => i);
  const steps: Step[] = [];
  const vars: Record<string, string> = {};

  const emit = (line: number, note: string, extra: Partial<Step> = {}) =>
    steps.push({
      line,
      rows: rows.map((r) => r.slice()),
      order: order.slice(),
      vars: { ...vars },
      note,
      calc: [],
      focusRows: [],
      ...extra,
    });

  /** R_target ← R_target − factor·R_source, with the arithmetic written out. */
  const replaceRow = (target: number, source: number, factor: Fraction): string[] => {
    const before = rows[target];
    rows[target] = before.map((v, k) => v.sub(factor.mul(rows[source][k])));
    return [
      `R${target + 1} = ${formatRow(before)} − ${factor.formatFactor()}·${formatRow(rows[source])}`,
      `   = ${formatRow(rows[target])}`,
    ];
  };

  emit(0, 'Write the system as an augmented matrix [A | b]. Each row is one equation.');

  // ---------- Forward elimination ----------
  let r = 0;
  vars.r = '1';
  emit(1, 'r marks the row where the next pivot will go.');

  const pivots: [number, number][] = [];
  for (let c = 0; c < n; c++) {
    const v = VAR_NAMES[c];
    vars.c = String(c + 1);
    delete vars.p;
    delete vars.i;
    delete vars.m;
    emit(2, `Column ${c + 1}: use one row to eliminate ${v} from the rows below it.`, { focusCol: c });

    let p = -1;
    for (let k = r; k < n; k++) {
      if (!rows[k][c].isZero()) {
        p = k;
        break;
      }
    }
    const below = Array.from({ length: n - r }, (_, k) => r + k);

    if (p === -1) {
      vars.p = 'none';
      emit(3, `Every entry of column ${c + 1} from row ${r + 1} down is 0, so there is no pivot here.`, {
        focusRows: below,
        focusCol: c,
      });
      emit(4, `${v} has no pivot, so it is a free variable. Skip to the next column.`, { focusCol: c });
      continue;
    }

    vars.p = String(p + 1);
    emit(3, `Scanning column ${c + 1} from row ${r + 1} down: row ${p + 1} has ${rows[p][c].format()} ≠ 0, so it can be the pivot.`, {
      focusRows: [p],
      focusCol: c,
      pivot: [p, c],
    });
    emit(4, 'A pivot exists, so we keep going.', { pivot: [p, c] });

    if (p !== r) {
      [rows[r], rows[p]] = [rows[p], rows[r]];
      [order[r], order[p]] = [order[p], order[r]];
      emit(5, `p ≠ r, so swap rows ${r + 1} and ${p + 1} to bring the pivot up.`, {
        op: { kind: 'swap', a: r, b: p },
        focusRows: [r, p],
        pivot: [r, c],
        calc: [`R${r + 1} ↔ R${p + 1}`],
      });
    } else {
      emit(5, 'p = r: the pivot is already in place, no swap needed.', { pivot: [r, c], focusRows: [r] });
    }
    pivots.push([r, c]);

    if (r + 1 >= n) {
      emit(6, 'There are no rows below the pivot, so there is nothing to eliminate.', { pivot: [r, c] });
    }
    for (let i = r + 1; i < n; i++) {
      vars.i = String(i + 1);
      delete vars.m;
      emit(6, `i = ${i + 1}: eliminate ${v} from row ${i + 1}.`, { pivot: [r, c], focusRows: [i] });

      const m = rows[i][c].div(rows[r][c]);
      vars.m = m.format();
      emit(7, `The multiplier is how many copies of row ${r + 1} cancel the ${v} term in row ${i + 1}.`, {
        pivot: [r, c],
        focusRows: [r, i],
        focusCol: c,
        calc: [`m = ${rows[i][c].format()} / ${rows[r][c].format()} = ${m.format()}`],
      });

      if (m.isZero()) {
        emit(8, `m = 0: row ${i + 1} already has 0 in column ${c + 1}, so nothing changes.`, {
          pivot: [r, c],
          focusRows: [i],
        });
      } else {
        const calc = replaceRow(i, r, m);
        emit(8, `Subtract ${m.formatFactor()} × row ${r + 1} from row ${i + 1}. Now A[${i + 1},${c + 1}] = 0.`, {
          op: { kind: 'replace', target: i, source: r, factor: m, col: c },
          pivot: [r, c],
          focusRows: [r, i],
          calc,
        });
      }
    }

    delete vars.i;
    delete vars.m;
    r++;
    vars.r = String(r + 1);
    emit(9, r < n ? `Column ${c + 1} is done. The next pivot goes in row ${r + 1}.` : `Column ${c + 1} is done. Every row has a pivot.`);
  }

  // ---------- Consistency check ----------
  delete vars.c;
  delete vars.p;
  const bad = rows.findIndex((row) => isZeroRow(row) && !row[n].isZero());
  if (bad !== -1) {
    emit(10, `Row ${bad + 1} reads 0 = ${rows[bad][n].format()}, which is impossible. The system has no solution.`, {
      focusRows: [bad],
    });
    return { steps, outcome: { kind: 'none', row: bad } };
  }
  const zeroRows = rows.map((row, k) => (isZeroRow(row) ? k : -1)).filter((k) => k !== -1);
  emit(
    10,
    zeroRows.length
      ? `Row${zeroRows.length > 1 ? 's' : ''} ${zeroRows.map((k) => k + 1).join(', ')} read${zeroRows.length > 1 ? '' : 's'} 0 = 0, which is always true. There's no contradiction, so the system is consistent.`
      : 'No row reads 0 = d with d ≠ 0, so the system is consistent.',
    { focusRows: zeroRows },
  );

  // ---------- Back substitution (Gauss–Jordan) ----------
  for (let k = pivots.length - 1; k >= 0; k--) {
    const [pr, pc] = pivots[k];
    const v = VAR_NAMES[pc];
    vars.r = String(pr + 1);
    vars.c = String(pc + 1);
    delete vars.i;
    emit(11, `Pivot at row ${pr + 1}, column ${pc + 1}. Work upward from the last pivot.`, {
      pivot: [pr, pc],
      focusRows: [pr],
    });

    const s = rows[pr][pc];
    if (s.isOne()) {
      emit(12, 'The pivot is already 1.', { pivot: [pr, pc], focusRows: [pr] });
    } else {
      const before = rows[pr];
      rows[pr] = before.map((x) => x.div(s));
      emit(12, `Divide row ${pr + 1} by ${s.format()} so the pivot becomes 1.`, {
        op: { kind: 'scale', row: pr, divisor: s },
        pivot: [pr, pc],
        focusRows: [pr],
        calc: [`R${pr + 1} = ${formatRow(before)} / ${s.formatFactor()}`, `   = ${formatRow(rows[pr])}`],
      });
    }

    if (pr === 0) emit(13, 'There are no rows above this pivot.', { pivot: [pr, pc] });
    for (let i = 0; i < pr; i++) {
      vars.i = String(i + 1);
      emit(13, `i = ${i + 1}: clear ${v} from row ${i + 1}, above the pivot.`, { pivot: [pr, pc], focusRows: [i] });
      const f = rows[i][pc];
      if (f.isZero()) {
        emit(14, `A[${i + 1},${pc + 1}] is already 0, so nothing changes.`, { pivot: [pr, pc], focusRows: [i] });
      } else {
        const calc = replaceRow(i, pr, f);
        emit(14, `Subtract ${f.formatFactor()} × row ${pr + 1} from row ${i + 1}. Now A[${i + 1},${pc + 1}] = 0.`, {
          op: { kind: 'replace', target: i, source: pr, factor: f, col: pc },
          pivot: [pr, pc],
          focusRows: [pr, i],
          calc,
        });
      }
    }
  }

  // ---------- Result ----------
  for (const k of Object.keys(vars)) delete vars[k];
  const pivotCols = new Set(pivots.map(([, c]) => c));
  const free = Array.from({ length: n }, (_, c) => c).filter((c) => !pivotCols.has(c));

  if (free.length === 0) {
    const x = rows.map((row) => row[n]);
    emit(15, `Each row now reads "variable = value", so the matrix is [I | x]. Solution: (${VAR_NAMES.slice(0, n).join(', ')}) = (${x.map((f) => f.format()).join(', ')}).`, {
      calc: rows.map((row) => formatEquation(row)),
    });
    return { steps, outcome: { kind: 'unique', x } };
  }

  // Express each pivot variable in terms of the free ones.
  const parts = pivots.map(([pr, pc]) => {
    let expr = rows[pr][n].isZero() ? '' : rows[pr][n].format();
    for (const fc of free) {
      const a = rows[pr][fc].neg();
      if (a.isZero()) continue;
      const mag = a.abs();
      const coef = mag.isOne() ? '' : mag.format();
      const sign = a.isNegative() ? (expr ? ' − ' : '−') : expr ? ' + ' : '';
      expr += `${sign}${coef}${VAR_NAMES[fc]}`;
    }
    return `${VAR_NAMES[pc]} = ${expr || '0'}`;
  });
  const freeNames = free.map((c) => VAR_NAMES[c]).join(', ');
  const description = `${parts.join(', ')}; ${freeNames} free`;
  emit(15, `${freeNames} can be anything, so there are infinitely many solutions: ${description}.`, {
    calc: parts,
  });
  return { steps, outcome: { kind: 'infinite', free, description } };
}
