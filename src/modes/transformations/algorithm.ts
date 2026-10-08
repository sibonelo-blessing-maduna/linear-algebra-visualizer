import { Fraction } from '../../math/fraction';
import { VAR_NAMES, type Rows } from '../../math/notation';

export const BASIS_NAMES = ['î', 'ĵ', 'k̂'];
const PRIMED = BASIS_NAMES.map((b) => `${b}′`);

/** The pseudocode for an n-dimensional input, plus the line numbers of its parts. */
export function pseudocode(n: number) {
  const coords = VAR_NAMES.slice(0, n);
  const recipe = (basis: string[]) => coords.map((c, k) => `${c}·${basis[k]}`).join(' + ');
  const code = [
    'procedure Apply(A, v):',
    `  write v = ${recipe(BASIS_NAMES)}`,
    ...coords.map((_, c) => `  ${PRIMED[c]} ← A·${BASIS_NAMES[c]}   (column ${c + 1} of A)`),
    `  Av ← ${recipe(PRIMED)}`,
    '  for i ← 1 to n:',
    '    (Av)_i ← (row i of A) · v',
    `  det A ← ${n === 2 ? 'area' : 'volume'} of the image of the unit ${n === 2 ? 'square' : 'cube'}`,
    '  return Av',
  ];
  const combine = 2 + n;
  return { code, lines: { start: 0, write: 1, basis: 2, combine, loop: combine + 1, row: combine + 2, det: combine + 3, ret: combine + 4 } };
}

export interface Step {
  line: number;
  /** The transformation drawn once this step finishes: columns of A moved in so far. */
  matrix: number[][];
  /** True when `matrix` differs from the previous step, so the grid should animate. */
  movesGrid: boolean;
  /** Head-to-tail component arrows: along the original basis, or the transformed one. */
  components: 'original' | 'transformed' | null;
  /** Grow the component arrows during this step's animation. */
  growComponents: boolean;
  /** Draw Av (pink) instead of the v that rides along with the grid. */
  showAv: boolean;
  /** Draw a faint copy of v where it started. */
  ghost: boolean;
  /** Coordinate of Av to drop a guide line for (row picture). */
  projectRow?: number;
  highlightUnit: boolean;
  /** Matrix-table highlights. */
  focusCol?: number;
  focusRow?: number;
  /** How many columns of A have been "moved" so far (for the matrix table). */
  revealedCols: number;
  revealAv: boolean;
  vars: Record<string, string>;
  note: string;
  calc: string[];
}

export interface Trace {
  steps: Step[];
  code: string[];
  lines: ReturnType<typeof pseudocode>['lines'];
  A: Rows;
  v: Fraction[];
  Av: Fraction[];
  det: Fraction;
}

const identity = (n: number): number[][] => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));

const vec = (xs: Fraction[]) => `(${xs.map((f) => f.format()).join(', ')})`;

/** Exact determinant by cofactor expansion along the first row, with the working written out. */
export function determinant(A: Rows): { value: Fraction; calc: string[] } {
  const f = (r: number, c: number) => A[r][c].formatFactor();
  if (A.length === 2) {
    const value = A[0][0].mul(A[1][1]).sub(A[0][1].mul(A[1][0]));
    return {
      value,
      calc: ['det A = a11·a22 − a12·a21', `      = ${f(0, 0)}·${f(1, 1)} − ${f(0, 1)}·${f(1, 0)}`, `      = ${value.format()}`],
    };
  }
  const minor = (c: number) => {
    const [p, q] = [0, 1, 2].filter((k) => k !== c);
    return A[1][p].mul(A[2][q]).sub(A[1][q].mul(A[2][p]));
  };
  const minors = [0, 1, 2].map(minor);
  const value = A[0][0].mul(minors[0]).sub(A[0][1].mul(minors[1])).add(A[0][2].mul(minors[2]));
  return {
    value,
    calc: [
      'det A = a11·M11 − a12·M12 + a13·M13   (M = 2×2 minors)',
      `      = ${f(0, 0)}·${minors[0].formatFactor()} − ${f(0, 1)}·${minors[1].formatFactor()} + ${f(0, 2)}·${minors[2].formatFactor()}`,
      `      = ${value.format()}`,
    ],
  };
}

/** Records every pseudocode line of "apply A to v", like a step-through debugger. */
export function traceTransformation(input: Rows): Trace {
  const n = input.length;
  const A = input.map((r) => r.slice(0, n));
  const v = input.map((r) => r[n]);
  const Av = A.map((row) => row.reduce((s, a, k) => s.add(a.mul(v[k])), Fraction.ZERO));
  const { code, lines } = pseudocode(n);
  const { value: det, calc: detCalc } = determinant(A);
  const An = A.map((r) => r.map((f) => f.toNumber()));
  const coords = VAR_NAMES.slice(0, n);
  const measure = n === 2 ? 'area' : 'volume';

  const steps: Step[] = [];
  let matrix = identity(n);
  const vars: Record<string, string> = {};
  let revealedCols = 0;

  const emit = (line: number, note: string, extra: Partial<Step> = {}) =>
    steps.push({
      line,
      matrix: matrix.map((r) => r.slice()),
      movesGrid: false,
      components: null,
      growComponents: false,
      showAv: false,
      ghost: revealedCols > 0,
      highlightUnit: false,
      revealedCols,
      revealAv: false,
      vars: { ...vars },
      note,
      calc: [],
      ...extra,
    });

  emit(lines.start, `A moves every point of space. To see how, we follow one vector v = ${vec(v)} through it.`);

  coords.forEach((c, k) => (vars[c] = v[k].format()));
  emit(lines.write, `Coordinates are a recipe: v means "go ${coords.map((_, k) => `${v[k].format()} step${v[k].abs().isOne() ? '' : 's'} along ${BASIS_NAMES[k]}`).join(', then ')}".`, {
    components: 'original',
    growComponents: true,
    calc: [`v = ${vec(v)} = ${coords.map((_, k) => `${v[k].formatFactor()}·${BASIS_NAMES[k]}`).join(' + ')}`],
  });

  for (let c = 0; c < n; c++) {
    matrix = matrix.map((row, r) => row.map((x, k) => (k === c ? An[r][c] : x)));
    revealedCols = c + 1;
    const col = A.map((r) => r[c]);
    emit(
      lines.basis + c,
      `Multiplying A by ${BASIS_NAMES[c]} just picks out column ${c + 1}, so that's where ${BASIS_NAMES[c]} lands. The whole grid is dragged along: lines stay straight, parallel and evenly spaced, and v rides with it.`,
      {
        movesGrid: true,
        components: 'transformed',
        focusCol: c,
        calc: [`${PRIMED[c]} = A·${BASIS_NAMES[c]} = ${vec(col)}`],
      },
    );
  }

  emit(
    lines.combine,
    `Same recipe, new ingredients: v was ${coords.map((_, k) => `${v[k].format()}·${BASIS_NAMES[k]}`).join(' + ')}, so Av is ${coords.map((_, k) => `${v[k].format()}·${PRIMED[k]}`).join(' + ')}. This is what "linear" means.`,
    {
      components: 'transformed',
      growComponents: true,
      showAv: true,
      revealAv: true,
      calc: [
        `Av = ${coords.map((_, k) => `${v[k].formatFactor()}·${vec(A.map((r) => r[k]))}`).join(' + ')}`,
        `   = ${vec(Av)}`,
      ],
    },
  );

  for (let i = 0; i < n; i++) {
    vars.i = String(i + 1);
    emit(lines.loop, `i = ${i + 1}: check coordinate ${i + 1} of Av another way.`, { showAv: true, revealAv: true, focusRow: i });
    const terms = A[i].map((a, k) => `${a.formatFactor()}·${v[k].formatFactor()}`).join(' + ');
    emit(lines.row, `Row picture: coordinate ${i + 1} of Av is row ${i + 1} of A dotted with v. It matches the column picture.`, {
      showAv: true,
      revealAv: true,
      focusRow: i,
      projectRow: i,
      calc: [`(Av)_${i + 1} = ${terms} = ${Av[i].format()}`],
    });
  }
  delete vars.i;

  const detNote = det.isZero()
    ? `det A = 0: the unit ${n === 2 ? 'square' : 'cube'} is squashed flat, so A collapses space onto a ${n === 2 ? 'line (or point)' : 'plane, line or point'}. Different points land in the same place, so A can't be undone.`
    : det.isNegative()
      ? `The unit ${n === 2 ? 'square' : 'cube'}'s ${measure} is scaled by |det A| = ${det.abs().format()}. The minus sign means orientation flipped: space was mirrored.`
      : `Every ${measure} is scaled by det A = ${det.format()}: the unit ${n === 2 ? 'square' : 'cube'} becomes a shape with ${measure} ${det.format()}.`;
  emit(lines.det, detNote, { showAv: true, revealAv: true, highlightUnit: true, calc: detCalc });

  emit(lines.ret, `A sends v = ${vec(v)} to Av = ${vec(Av)}.`, { showAv: true, revealAv: true, calc: [`Av = ${vec(Av)}`] });

  return { steps, code, lines, A, v, Av, det };
}
