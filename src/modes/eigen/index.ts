import { Stepper, esc } from '../../core/stepper';
import type { Dimension } from '../../scene/grid';
import { LINES, PSEUDOCODE, traceEigen, type Step, type Trace } from './algorithm';
import { renderPolyChart, type PolyChart } from './chart';
import { EIGEN_CSS, EigenGeometry, type Frame } from './geometry';
import { fmtNum, formatPoly } from './math';

const PRESETS: Record<Dimension, Record<string, string[][]>> = {
  2: {
    'Stretch along two lines': [['2', '1'], ['1', '2']],
    'Different stretches': [['3', '1'], ['0', '2']],
    'One direction flips (λ < 0)': [['1', '2'], ['2', '1']],
    'Projection (λ = 0)': [['1', '1'], ['0', '0']],
    'Irrational eigenvalues': [['2', '1'], ['1', '1']],
    'Shear (too few eigenvectors)': [['1', '1'], ['0', '1']],
    'Rotation (no real λ)': [['0', '-1'], ['1', '0']],
    'Uniform scale (every vector)': [['2', '0'], ['0', '2']],
  },
  3: {
    'Three stretches': [['4', '1', '0'], ['0', '3', '1'], ['0', '0', '2']],
    'Eigenplane (repeated λ)': [['2', '1', '0'], ['1', '2', '0'], ['0', '0', '3']],
    'Irrational eigenvalues': [['2', '1', '0'], ['1', '2', '1'], ['0', '1', '2']],
    'Rotation about z (one real λ)': [['0', '-1', '0'], ['1', '0', '0'], ['0', '0', '1']],
    'Shear (too few eigenvectors)': [['1', '1', '0'], ['0', '1', '0'], ['0', '0', '2']],
  },
};

const identity = (n: number) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
const shift = (A: number[][], lambda: number) => A.map((r, i) => r.map((a, j) => (i === j ? a - lambda : a)));
const lerp = (X: number[][], Y: number[][], t: number) => X.map((r, i) => r.map((x, j) => x + (Y[i][j] - x) * t));

function phaseOf(line: number): string {
  if (line <= LINES.apply) return 'Setup';
  if (line === LINES.find) return 'Search';
  if (line <= LINES.det) return 'Algebra';
  if (line === LINES.poly) return 'Characteristic polynomial';
  if (line <= LINES.check) return 'Eigenvectors';
  return 'Result';
}

/** "Eigenvectors" section: the directions A doesn't turn, found step by step beside the moving grid. */
export function mountEigen(root: HTMLElement): () => void {
  const stepper = new Stepper(root, {
    presets: PRESETS,
    blocks: [{ label: 'A', width: 'n' }],
    stateTitle: 'p(λ) = det(A − λI)',
    views: [{ id: 'grid', label: 'Grid' }],
    camera3D: [5, 4, 6.5],
  });
  const geometry = new EigenGeometry(stepper.viewport);

  let n: Dimension = 2;
  let trace: Trace;
  let An: number[][] = [];
  let chart: PolyChart;
  /** Angle (mod π) of each eigen line, for revealing it as the 2D sweep passes. */
  let lineAngles: number[] = [];
  /** Where the λ slide stops: the largest eigenvalue, or the end of the range. */
  let sweepEnd = 0;

  function geoNote(s: Step): string {
    const shape = n === 2 ? 'line' : 'plane';
    switch (s.line) {
      case LINES.start:
        return 'Gold vectors are still on the line they started on. Grey ones have been turned off it.';
      case LINES.apply:
        return trace.pairs.length
          ? 'Only the vectors along the dashed eigen-directions stay gold: A stretches them, but never turns them.'
          : 'Every vector gets turned: no direction survives.';
      case LINES.find:
        return n === 2 ? 'White: v. Pink: Av. They flash gold when Av lands on v\'s line, and that direction gets a dashed line.' : 'Dashed lines: the directions A doesn\'t turn.';
      case LINES.rewrite:
        return 'Same question, rewritten: which nonzero v does A − λI send to 0?';
      case LINES.det:
        return `The grid shows A − λI as λ slides. Each time it flattens onto a ${n === 2 ? 'line' : shape}, det = 0 and λ is an eigenvalue.`;
      case LINES.poly:
        return trace.roots.real.length ? 'The plot marks where p(λ) crosses 0, in the same colours as the eigen-directions.' : 'p(λ) never reaches 0, so A − λI never flattens.';
      case LINES.loop:
        return 'A − λI squashes space: everything on the eigen-direction is sent to the origin.';
      case LINES.solve:
        return 'v sits on the dashed line; A − λI sends it to the pink dot at the origin.';
      case LINES.check:
        return 'Back to A: v (coloured) and Av (pink) lie on the same line. Av is exactly λ times v.';
      default:
        return trace.pairs.length ? 'Every eigenvector with its image: A only stretches along these directions.' : 'No real eigen-directions to show.';
    }
  }

  function renderState(): void {
    const roots = trace.roots.real.map((r) => ({ value: r.value, label: r.label }));
    stepper.state.innerHTML = `
      <p class="poly-text">p(λ) = ${esc(formatPoly(trace.poly))}</p>
      <div data-chart></div>
      <ul class="eigen-list" data-pairs></ul>`;
    chart = renderPolyChart(stepper.$('[data-chart]'), trace.poly.map((c) => c.toNumber()), roots, trace.range);
  }

  /** Eigenpairs are listed once they've been found. */
  function renderPairs(s: Step, k: number): void {
    const done = s.line === LINES.ret ? trace.pairs.length : s.pair !== undefined ? s.pair + (s.line >= LINES.solve ? 1 : 0) : 0;
    const items = trace.pairs.slice(0, done).map(
      (p, i) =>
        `<li style="--c:${EIGEN_CSS[i]}">λ = ${esc(p.lambda.label)}${p.lambda.multiplicity > 1 ? ` (×${p.lambda.multiplicity})` : ''} → v = ${esc(p.display.join(', '))}</li>`,
    );
    if (s.line === LINES.ret && trace.roots.complex.length) items.push(`<li class="muted">complex: λ = ${esc(trace.roots.complex.join(', '))}</li>`);
    if (!items.length && k > 0 && s.line >= LINES.poly && !trace.pairs.length) items.push('<li class="muted">no real eigenvalues</li>');
    stepper.$('[data-pairs]').innerHTML = items.join('');
  }

  const gridMatrix = (s: Step) => (s.grid === 'I' ? identity(n) : s.grid === 'A' ? An : shift(An, s.grid.lambda));
  const allLines = () => trace.pairs.map(() => true);

  function frameOf(s: Step, matrix = gridMatrix(s), extra: Partial<Frame> = {}): Frame {
    return {
      matrix,
      fan: s.fan,
      linesVisible: s.lines ? allLines() : trace.pairs.map(() => false),
      pair: s.pair,
      vectors: s.vectors,
      ...extra,
    };
  }

  function draw(f: Frame, lambda?: number): void {
    const det = geometry.draw(f);
    const d = Math.abs(det) < 5e-4 ? '0.000' : det.toFixed(3);
    stepper.setReadout(lambda === undefined ? `det = ${d}` : `λ = ${fmtNum(Math.round(lambda * 1000) / 1000)}   det(A − λI) = ${d}`);
  }

  const lambdaOf = (s: Step) => (typeof s.grid === 'object' ? s.grid.lambda : undefined);

  stepper.start({
    load(size, rows) {
      n = size;
      trace = traceEigen(rows);
      An = rows.map((r) => r.map((f) => f.toNumber()));
      geometry.build(n, An, trace.pairs.map((p) => ({ vectors: p.vectors, lambda: p.lambda.value })));
      lineAngles = trace.pairs.map((p) => {
        const a = Math.atan2(p.vectors[0][1], p.vectors[0][0]);
        return ((a % Math.PI) + Math.PI) % Math.PI;
      });
      sweepEnd = trace.roots.real.length ? trace.roots.real[0].value : trace.range[1];
      renderState();
      return { code: PSEUDOCODE, steps: trace.steps.length };
    },

    show(k, animate) {
      const s = trace.steps[k];
      stepper.setLine(s.line);
      stepper.setPhase(phaseOf(s.line));
      stepper.setNote(s.note);
      stepper.setCalc(s.calc);
      stepper.setVars(s.vars);
      stepper.setGeo(geoNote(s));
      renderPairs(s, k);
      chart.setMarker(s.chartLambda ?? null);

      if (animate && s.motion) return s.motion === 'sweepV' || s.motion === 'sweepLambda' ? 4500 : 1500;
      draw(frameOf(s), lambdaOf(s));
      return 0;
    },

    frame(k, t) {
      const s = trace.steps[k];
      switch (s.motion) {
        case 'toA':
          return draw(frameOf(s, lerp(identity(n), An, t)));
        case 'sweepV': {
          // A full turn; each eigen line appears as v passes over it.
          const angle = 2 * Math.PI * t;
          return draw(frameOf(s, An, { sweepAngle: angle, linesVisible: lineAngles.map((a) => angle >= a) }));
        }
        case 'sweepLambda': {
          const [lo] = trace.range;
          const lambda = lo + (sweepEnd - lo) * t;
          chart.setMarker(lambda);
          return draw(frameOf(s, shift(An, lambda)), lambda);
        }
        case 'collapse': {
          const lambda = lambdaOf(s)!;
          return draw(frameOf(s, shift(An, lambda * t)), lambda * t);
        }
        case 'restore': {
          const lambda = trace.pairs[s.pair!].lambda.value;
          return draw(frameOf(s, shift(An, lambda * (1 - t))));
        }
        default:
          return draw(frameOf(s), lambdaOf(s));
      }
    },

    viewChanged(k) {
      draw(frameOf(trace.steps[k]), lambdaOf(trace.steps[k]));
    },
  });

  return () => {
    geometry.dispose();
    stepper.dispose();
  };
}
