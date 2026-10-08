import { Fraction } from '../../math/fraction';
import type { Rows } from '../../math/notation';

/** Formats a float like a hand calculation: integers plainly, otherwise up to 3 decimals. */
export function fmtNum(x: number): string {
  const r = Math.round(x);
  const s = Math.abs(x - r) < 1e-9 ? String(Math.abs(r)) : Math.abs(x).toFixed(3).replace(/\.?0+$/, '');
  return x < 0 && s !== '0' ? `−${s}` : s;
}

export interface Eigenvalue {
  value: number;
  /** Set when λ is rational, so (A − λI) can be reduced exactly. */
  exact?: Fraction;
  label: string;
  /** How many times λ is a root of p(λ). */
  multiplicity: number;
}

export interface Roots {
  real: Eigenvalue[];
  /** Labels of complex-conjugate pairs, e.g. "±i". */
  complex: string[];
}

/**
 * Coefficients of p(λ) = det(A − λI), highest power first.
 * 2×2: λ² − (tr A)λ + det A.   3×3: −λ³ + (tr A)λ² − c·λ + det A, where c sums the 2×2 principal minors.
 */
export function charPoly(A: Rows): Fraction[] {
  const tr = A.reduce((s, row, i) => s.add(row[i]), Fraction.ZERO);
  const minor = (i: number, j: number) => A[i][i].mul(A[j][j]).sub(A[i][j].mul(A[j][i]));
  if (A.length === 2) return [Fraction.ONE, tr.neg(), minor(0, 1)];
  const c = minor(0, 1).add(minor(0, 2)).add(minor(1, 2));
  const det = A[0][0]
    .mul(minor(1, 2))
    .sub(A[0][1].mul(A[1][0].mul(A[2][2]).sub(A[1][2].mul(A[2][0]))))
    .add(A[0][2].mul(A[1][0].mul(A[2][1]).sub(A[1][1].mul(A[2][0]))));
  return [Fraction.ONE.neg(), tr, c.neg(), det];
}

export function evalPoly(coeffs: Fraction[] | number[], x: number): number {
  return (coeffs as (Fraction | number)[]).reduce<number>((s, c) => s * x + (typeof c === 'number' ? c : c.toNumber()), 0);
}

/** "λ² − 4λ + 3" */
export function formatPoly(coeffs: Fraction[]): string {
  const deg = coeffs.length - 1;
  let out = '';
  coeffs.forEach((c, k) => {
    if (c.isZero()) return;
    const p = deg - k;
    const mag = c.abs();
    const coef = p > 0 && mag.isOne() ? '' : mag.d === 1 || p === 0 ? mag.format() : `(${mag.format()})`;
    const term = p === 0 ? coef : `${coef}λ${p > 1 ? (p === 2 ? '²' : '³') : ''}`;
    out += c.isNegative() ? (out ? ' − ' : '−') : out ? ' + ' : '';
    out += term;
  });
  return out || '0';
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
const divisors = (n: number) => {
  const out: number[] = [];
  for (let d = 1; d * d <= n; d++) if (n % d === 0) out.push(d, n / d);
  return out;
};

/** Divides by (λ − r); returns the quotient. */
function deflate(coeffs: Fraction[], r: Fraction): Fraction[] {
  const out: Fraction[] = [];
  let carry = Fraction.ZERO;
  for (const c of coeffs.slice(0, -1)) {
    carry = carry.mul(r).add(c);
    out.push(carry);
  }
  return out;
}

const valueAt = (coeffs: Fraction[], r: Fraction) => coeffs.reduce((s, c) => s.mul(r).add(c), Fraction.ZERO);

/** A rational root by the rational root theorem, if there is one. */
function rationalRoot(coeffs: Fraction[]): Fraction | null {
  if (coeffs[coeffs.length - 1].isZero()) return Fraction.ZERO;
  const lcm = coeffs.reduce((l, c) => (l * c.d) / gcd(l, c.d), 1);
  const ints = coeffs.map((c) => (c.n * lcm) / c.d);
  const lead = Math.abs(ints[0]);
  const last = Math.abs(ints[ints.length - 1]);
  if (last > 1e7 || lead > 1e7) return null;
  for (const p of divisors(last))
    for (const q of divisors(lead))
      for (const r of [new Fraction(p, q), new Fraction(-p, q)]) if (valueAt(coeffs, r).isZero()) return r;
  return null;
}

/** √ of a fraction, if it is a perfect square. */
function exactSqrt(f: Fraction): Fraction | null {
  const rn = Math.round(Math.sqrt(f.n));
  const rd = Math.round(Math.sqrt(f.d));
  return rn * rn === f.n && rd * rd === f.d ? new Fraction(rn, rd) : null;
}

/** Real cube-root-safe numeric roots of a cubic a x³ + b x² + c x + d (used only when no rational root exists). */
function numericCubic([a, b, c, d]: number[]): { real: number[]; complex: [number, number][] } {
  const p = (3 * a * c - b * b) / (3 * a * a);
  const q = (2 * b ** 3 - 9 * a * b * c + 27 * a * a * d) / (27 * a ** 3);
  const shift = -b / (3 * a);
  const disc = (q * q) / 4 + (p ** 3) / 27;
  if (disc < 0) {
    const r = 2 * Math.sqrt(-p / 3);
    const phi = Math.acos((3 * q) / (p * r));
    return { real: [0, 1, 2].map((k) => r * Math.cos(phi / 3 - (2 * Math.PI * k) / 3) + shift), complex: [] };
  }
  const u = Math.cbrt(-q / 2 + Math.sqrt(disc));
  const v = Math.cbrt(-q / 2 - Math.sqrt(disc));
  const re = -(u + v) / 2 + shift;
  const im = (Math.sqrt(3) / 2) * Math.abs(u - v);
  return { real: [u + v + shift], complex: im > 1e-12 ? [[re, im]] : [] };
}

/** Roots of p(λ): exact when rational (or a clean quadratic surd), numeric otherwise. */
export function eigenvalues(coeffs: Fraction[]): Roots {
  const found: Eigenvalue[] = [];
  const complex: string[] = [];
  const add = (e: Omit<Eigenvalue, 'multiplicity'>) => {
    const same = found.find((f) => Math.abs(f.value - e.value) < 1e-9);
    if (same) same.multiplicity++;
    else found.push({ ...e, multiplicity: 1 });
  };

  let poly = coeffs;
  for (let r = rationalRoot(poly); poly.length > 1 && r; r = poly.length > 1 ? rationalRoot(poly) : null) {
    add({ value: r.toNumber(), exact: r, label: r.format() });
    poly = deflate(poly, r);
  }

  if (poly.length === 3) {
    const [a, b, c] = poly;
    const D = b.mul(b).sub(new Fraction(4).mul(a).mul(c));
    const twoA = new Fraction(2).mul(a);
    const center = b.neg().div(twoA);
    const sq = !D.isNegative() ? exactSqrt(D) : exactSqrt(D.neg());
    if (D.isNegative()) {
      const im = Math.sqrt(-D.toNumber()) / Math.abs(twoA.toNumber());
      const imLabel = sq ? sq.div(twoA.abs()).format() : fmtNum(im);
      complex.push(`${center.isZero() ? '' : `${center.format()} `}± ${imLabel === '1' ? '' : imLabel}i`);
    } else {
      // Irrational: (−b ± √D) / 2a
      const s = Math.sqrt(D.toNumber());
      for (const sign of [1, -1]) {
        const value = (-b.toNumber() + sign * s) / twoA.toNumber();
        const label = `(${b.neg().format()} ${sign > 0 ? '+' : '−'} √${D.format()})/${twoA.format()} ≈ ${fmtNum(value)}`;
        add({ value, label });
      }
    }
  } else if (poly.length === 4) {
    const { real, complex: pairs } = numericCubic(poly.map((c) => c.toNumber()));
    real.forEach((value) => add({ value, label: `≈ ${fmtNum(value)}` }));
    pairs.forEach(([re, im]) => complex.push(`${fmtNum(re)} ± ${fmtNum(im)}i`));
  }

  found.sort((x, y) => y.value - x.value);
  return { real: found, complex };
}

// ---------- Null spaces ----------

/** Basis of the null space of M by row reduction, exactly. Basis vectors are scaled to small integers. */
export function nullSpaceExact(M: Rows): Fraction[][] {
  const n = M[0].length;
  const R = M.map((r) => r.slice());
  const pivots: number[] = [];
  let row = 0;
  for (let c = 0; c < n && row < R.length; c++) {
    const p = R.findIndex((r, i) => i >= row && !r[c].isZero());
    if (p === -1) continue;
    [R[row], R[p]] = [R[p], R[row]];
    const s = R[row][c];
    R[row] = R[row].map((x) => x.div(s));
    R.forEach((r, i) => {
      if (i !== row && !r[c].isZero()) {
        const f = r[c];
        R[i] = r.map((x, k) => x.sub(f.mul(R[row][k])));
      }
    });
    pivots.push(c);
    row++;
  }
  const free = Array.from({ length: n }, (_, c) => c).filter((c) => !pivots.includes(c));
  return free.map((fc) => {
    const v = Array.from({ length: n }, () => Fraction.ZERO);
    v[fc] = Fraction.ONE;
    pivots.forEach((pc, r) => (v[pc] = R[r][fc].neg()));
    // Scale to integers with no common factor, first nonzero entry positive.
    const lcm = v.reduce((l, f) => (l * f.d) / gcd(l, f.d), 1);
    const ints = v.map((f) => (f.n * lcm) / f.d);
    const g = ints.reduce((a, b) => gcd(a, b), 0) || 1;
    const sign = Math.sign(ints.find((x) => x !== 0) ?? 1);
    return ints.map((x) => new Fraction((sign * x) / g));
  });
}

/** Null-space basis of a float matrix (tolerance-based); vectors are normalised. */
export function nullSpaceNumeric(M: number[][]): number[][] {
  const n = M[0].length;
  const R = M.map((r) => r.slice());
  const scale = Math.max(1, ...M.flat().map(Math.abs));
  const tol = 1e-7 * scale;
  const pivots: number[] = [];
  let row = 0;
  for (let c = 0; c < n && row < R.length; c++) {
    let p = -1;
    for (let i = row; i < R.length; i++) if (Math.abs(R[i][c]) > tol && (p === -1 || Math.abs(R[i][c]) > Math.abs(R[p][c]))) p = i;
    if (p === -1) continue;
    [R[row], R[p]] = [R[p], R[row]];
    const s = R[row][c];
    R[row] = R[row].map((x) => x / s);
    R.forEach((r, i) => {
      if (i !== row) {
        const f = r[c];
        R[i] = r.map((x, k) => x - f * R[row][k]);
      }
    });
    pivots.push(c);
    row++;
  }
  const free = Array.from({ length: n }, (_, c) => c).filter((c) => !pivots.includes(c));
  return free.map((fc) => {
    const v = Array.from({ length: n }, () => 0);
    v[fc] = 1;
    pivots.forEach((pc, r) => (v[pc] = -R[r][fc]));
    const len = Math.hypot(...v);
    const sign = Math.sign(v.find((x) => Math.abs(x) > 1e-12) ?? 1);
    return v.map((x) => (sign * x) / len);
  });
}
