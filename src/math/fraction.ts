function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

/** Exact rational number, so elimination shows 3/2 instead of 1.4999999. */
export class Fraction {
  readonly n: number;
  readonly d: number;

  constructor(n: number, d = 1) {
    if (d === 0) throw new Error('Division by zero');
    if (d < 0) [n, d] = [-n, -d];
    const g = gcd(n, d);
    this.n = n / g + 0; // + 0 turns -0 into 0
    this.d = d / g;
  }

  static readonly ZERO = new Fraction(0);
  static readonly ONE = new Fraction(1);

  /** Parses "3", "-2/5" or "0.25". Returns null if the text isn't a number. */
  static parse(text: string): Fraction | null {
    const s = text.trim().replace('−', '-');
    let m = /^([+-]?\d+)\s*\/\s*(\d+)$/.exec(s);
    if (m) return Number(m[2]) === 0 ? null : new Fraction(Number(m[1]), Number(m[2]));
    m = /^([+-]?)(\d*)(?:\.(\d+))?$/.exec(s);
    if (!m || (m[2] === '' && !m[3])) return null;
    const decimals = m[3] ?? '';
    const scale = 10 ** decimals.length;
    const value = Number((m[2] || '0') + decimals);
    return new Fraction(m[1] === '-' ? -value : value, scale);
  }

  add(o: Fraction): Fraction { return new Fraction(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o: Fraction): Fraction { return new Fraction(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o: Fraction): Fraction { return new Fraction(this.n * o.n, this.d * o.d); }
  div(o: Fraction): Fraction { return new Fraction(this.n * o.d, this.d * o.n); }
  neg(): Fraction { return new Fraction(-this.n, this.d); }
  abs(): Fraction { return new Fraction(Math.abs(this.n), this.d); }

  isZero(): boolean { return this.n === 0; }
  isOne(): boolean { return this.n === 1 && this.d === 1; }
  isNegative(): boolean { return this.n < 0; }
  equals(o: Fraction): boolean { return this.n === o.n && this.d === o.d; }
  toNumber(): number { return this.n / this.d; }

  /** Display form with a typographic minus sign. */
  format(): string {
    const s = this.d === 1 ? `${Math.abs(this.n)}` : `${Math.abs(this.n)}/${this.d}`;
    return this.n < 0 ? `−${s}` : s;
  }

  /** Like format(), but wrapped in parentheses when used as a factor, e.g. (−2)·R1. */
  formatFactor(): string {
    return this.n < 0 || this.d !== 1 ? `(${this.format()})` : this.format();
  }
}
