import { Fraction } from '../../math/fraction';
import type { Rows } from '../../math/notation';
import { charPoly, eigenvalues, fmtNum, formatPoly, nullSpaceExact, nullSpaceNumeric, type Eigenvalue, type Roots } from './math';

export const LINES = { start: 0, apply: 1, find: 2, rewrite: 3, det: 4, poly: 5, loop: 6, solve: 7, check: 8, ret: 9 };

const note = (code: string, comment: string) => `${code.padEnd(30)}▹ ${comment}`;

export const PSEUDOCODE = [
  'procedure Eigen(A):',
  note('  apply A to every vector', 'most leave their line'),
  note('  find v ≠ 0 with A·v = λ·v', 'v stays on its line'),
  '  ⇔ (A − λI)·v = 0 for some v ≠ 0',
  note('  ⇔ det(A − λI) = 0', 'A − λI flattens space'),
  '  p(λ) ← det(A − λI); solve p(λ) = 0',
  '  for each real root λ:',
  '    v ← null space of (A − λI)',
  '    check A·v = λ·v',
  '  return the pairs (λ, v)',
];

export interface EigenPair {
  lambda: Eigenvalue;
  /** Basis of the eigenspace (unit length, for drawing). */
  vectors: number[][];
  /** The same basis for display: small integers when λ is rational. */
  display: string[];
}

export type Motion = 'toA' | 'sweepV' | 'sweepLambda' | 'collapse' | 'restore' | null;

export interface Step {
  line: number;
  motion: Motion;
  /** What the grid shows once the step is done: I, A, or A − λI. */
  grid: 'I' | 'A' | { lambda: number };
  fan: boolean;
  /** Eigen lines drawn (after the search). */
  lines: boolean;
  /** Eigenpair in focus, and how it is drawn. */
  pair?: number;
  vectors: 'none' | 'null' | 'check' | 'all';
  /** λ marked on the p(λ) chart. */
  chartLambda?: number;
  vars: Record<string, string>;
  note: string;
  calc: string[];
}

export interface Trace {
  steps: Step[];
  A: Rows;
  poly: Fraction[];
  roots: Roots;
  pairs: EigenPair[];
  /** λ range for the sweep and the chart. */
  range: [number, number];
  diagonalizable: boolean;
}

const vecStr = (xs: string[]) => `(${xs.join(', ')})`;

export function traceEigen(A: Rows): Trace {
  const n = A.length;
  const An = A.map((r) => r.map((f) => f.toNumber()));
  const poly = charPoly(A);
  const roots = eigenvalues(poly);

  const pairs: EigenPair[] = roots.real.map((lambda) => {
    if (lambda.exact) {
      const shifted = A.map((row, i) => row.map((a, j) => (i === j ? a.sub(lambda.exact!) : a)));
      const basis = nullSpaceExact(shifted);
      return {
        lambda,
        vectors: basis.map((v) => {
          const xs = v.map((f) => f.toNumber());
          const len = Math.hypot(...xs);
          return xs.map((x) => x / len);
        }),
        display: basis.map((v) => vecStr(v.map((f) => f.format()))),
      };
    }
    const basis = nullSpaceNumeric(An.map((row, i) => row.map((a, j) => (i === j ? a - lambda.value : a))));
    return { lambda, vectors: basis, display: basis.map((v) => vecStr(v.map(fmtNum))) };
  });

  const geometric = pairs.reduce((s, p) => s + p.vectors.length, 0);
  const diagonalizable = geometric === n;

  const values = roots.real.map((r) => r.value);
  const center = A.reduce((s, row, i) => s + row[i].toNumber(), 0) / n;
  const lo = Math.min(center - 2.5, ...values.map((v) => v - 1.5));
  const hi = Math.max(center + 2.5, ...values.map((v) => v + 1.5));

  const steps: Step[] = [];
  const vars: Record<string, string> = {};
  const emit = (line: number, note: string, extra: Partial<Step> = {}) =>
    steps.push({ line, motion: null, grid: 'A', fan: false, lines: false, vectors: 'none', vars: { ...vars }, note, calc: [], ...extra });

  emit(LINES.start, 'An eigenvector of A is a direction A doesn\'t turn: it only gets stretched, shrunk or flipped. Its stretch factor is the eigenvalue λ.', {
    grid: 'I',
    fan: true,
  });

  emit(LINES.apply, 'Apply A and watch a fan of vectors ride along with the grid. Almost all of them get turned off the line they started on.', {
    motion: 'toA',
    fan: true,
  });

  emit(
    LINES.find,
    n === 2
      ? 'Sweep one vector v all the way round and draw Av next to it. Wherever Av points along v (or straight back), v is an eigenvector.'
      : 'In 3D it\'s hard to search every direction by eye, but the vectors that kept their direction are marked: those are the eigen-directions.',
    { motion: n === 2 ? 'sweepV' : null, fan: n === 3, lines: true },
  );

  emit(LINES.rewrite, 'Move λv to the left and factor out v. The identity I is needed because a matrix can\'t be subtracted from a number.', {
    lines: true,
    calc: ['A·v = λ·v', 'A·v − λ·I·v = 0', '(A − λI)·v = 0'],
  });

  emit(
    LINES.det,
    'A nonzero v gets sent to 0 only if A − λI squashes space flat, and that happens exactly when its determinant is 0. Slide λ and watch: the grid of A − λI flattens at each eigenvalue.',
    { motion: 'sweepLambda', grid: { lambda: values.length ? values[0] : hi }, chartLambda: values.length ? values[0] : hi },
  );

  const rootsText = roots.real.length
    ? roots.real.map((r) => `λ = ${r.label}${r.multiplicity > 1 ? ` (×${r.multiplicity})` : ''}`).join(', ')
    : 'no real roots';
  emit(LINES.poly, `Expanding the determinant gives a polynomial in λ. Its roots are the eigenvalues: ${rootsText}.`, {
    lines: true,
    calc: [
      `p(λ) = det(A − λI) = ${formatPoly(poly)}`,
      roots.real.length ? `roots: ${rootsText}` : 'no real roots',
      ...(roots.complex.length ? [`complex roots: λ = ${roots.complex.join(', ')}`] : []),
    ],
  });

  pairs.forEach((pair, k) => {
    const lam = pair.lambda;
    vars.λ = lam.exact ? lam.exact.format() : fmtNum(lam.value);
    emit(LINES.loop, `λ = ${lam.label}: A − λI flattens space, sending a whole line${pair.vectors.length > 1 ? ' (here, a whole plane)' : ''} to 0.`, {
      motion: 'collapse',
      grid: { lambda: lam.value },
      lines: true,
      pair: k,
      vectors: 'none',
      chartLambda: lam.value,
    });

    const shiftedLabel = lam.exact
      ? A.map((row, i) => row.map((a, j) => (i === j ? a.sub(lam.exact!) : a).format()).join('  ')).join(' ; ')
      : An.map((row, i) => row.map((a, j) => fmtNum(i === j ? a - lam.value : a)).join('  ')).join(' ; ');
    emit(
      LINES.solve,
      pair.vectors.length > 1
        ? `Row reducing A − λI leaves ${pair.vectors.length} free variables, so every vector in a whole plane is an eigenvector for this λ.`
        : 'Row reducing A − λI leaves one free variable. Every multiple of v is sent to 0: that line is the eigen-direction.',
      {
        grid: { lambda: lam.value },
        lines: true,
        pair: k,
        vectors: 'null',
        chartLambda: lam.value,
        calc: [`A − λI = [${shiftedLabel}]`, ...pair.display.map((d, i) => `v${pair.vectors.length > 1 ? i + 1 : ''} = ${d}`)],
      },
    );

    const checks = pair.vectors.map((v) => {
      const Av = An.map((row) => row.reduce((s, a, j) => s + a * v[j], 0));
      return { Av, scaled: v.map((x) => x * lam.value) };
    });
    const sample = lam.exact
      ? (() => {
          const v = pair.display[0].slice(1, -1).split(', ').map((s) => Fraction.parse(s)!);
          const Av = A.map((row) => row.reduce((s, a, j) => s.add(a.mul(v[j])), Fraction.ZERO));
          return [`A·v = ${vecStr(Av.map((f) => f.format()))}`, `λ·v = ${lam.exact!.formatFactor()}·${pair.display[0]} = ${vecStr(v.map((f) => lam.exact!.mul(f).format()))}  ✓`];
        })()
      : [`A·v = ${vecStr(checks[0].Av.map(fmtNum))}`, `λ·v = ${vecStr(checks[0].scaled.map(fmtNum))}  ✓`];
    const stretch =
      lam.value < 0
        ? `flips it and scales it by ${fmtNum(Math.abs(lam.value))}`
        : Math.abs(lam.value) < 1e-9
          ? 'crushes it to 0'
          : Math.abs(lam.value - 1) < 1e-9
            ? 'leaves it exactly where it is'
            : `stretches it by ${fmtNum(lam.value)}`;
    emit(LINES.check, `Back to A: v stays on its line, and A ${stretch}.`, {
      motion: 'restore',
      lines: true,
      pair: k,
      vectors: 'check',
      chartLambda: lam.value,
      calc: sample,
    });
  });
  delete vars.λ;

  let summary: string;
  if (!roots.real.length) {
    summary = 'p(λ) has no real roots, so no real direction survives: A turns every vector off its line, like a rotation. Its eigenvectors only exist with complex numbers.';
  } else if (diagonalizable) {
    summary = `${n} independent eigen-directions: measured along them, A just stretches each one by its own λ. That is what "diagonalizable" means: A = PDP⁻¹, with the eigenvectors in P and the eigenvalues in D.`;
  } else {
    const missing = roots.complex.length ? 'some roots are complex' : 'a repeated λ has fewer eigen-directions than its multiplicity';
    summary = `Only ${geometric} independent eigen-direction${geometric === 1 ? '' : 's'} for ${n} dimensions (${missing}), so A can't be diagonalized over the real numbers.`;
  }
  emit(LINES.ret, summary, {
    lines: true,
    vectors: 'all',
    calc: pairs.flatMap((p) => p.display.map((d) => `λ = ${p.lambda.label}:  v = ${d}`)),
  });

  return { steps, A, poly, roots, pairs, range: [lo, hi], diagonalizable };
}
