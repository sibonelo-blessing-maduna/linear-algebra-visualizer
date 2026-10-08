import { Stepper } from '../../core/stepper';
import type { Rows } from '../../math/notation';
import type { Dimension } from '../../scene/grid';
import { BASIS_COLORS } from '../../scene/basis';
import { BASIS_NAMES } from '../transformations/algorithm';
import { LINES, traceMultiplication, type Step, type Trace } from './algorithm';
import { MultiplyGeometry, matMul, type Frame } from './geometry';

/** Rows of [A | B]; the product AB means "first B, then A". */
const PRESETS: Record<Dimension, Record<string, string[][]>> = {
  2: {
    'Rotate 90°, then shear': [['1', '1', '0', '-1'], ['0', '1', '1', '0']],
    'Shear, then rotate 90°': [['0', '-1', '1', '1'], ['1', '0', '0', '1']],
    'Scale, then rotate 90°': [['0', '-1', '2', '0'], ['1', '0', '0', '1/2']],
    'Rotate 90°, then rotate 90° again': [['0', '-1', '0', '-1'], ['1', '0', '1', '0']],
    'Reflect, then reflect again': [['0', '1', '0', '1'], ['1', '0', '1', '0']],
    'Flatten, then rotate (det = 0)': [['0', '-1', '1', '0'], ['1', '0', '0', '0']],
    'General matrices': [['1', '-1', '2', '1'], ['1', '2', '0', '1']],
  },
  3: {
    'Rotate about z, then shear': [['1', '0', '1', '0', '-1', '0'], ['0', '1', '0', '1', '0', '0'], ['0', '0', '1', '0', '0', '1']],
    'Shear, then rotate about z': [['0', '-1', '0', '1', '0', '1'], ['1', '0', '0', '0', '1', '0'], ['0', '0', '1', '0', '0', '1']],
    'Rotate about z, then about x': [['1', '0', '0', '0', '-1', '0'], ['0', '0', '-1', '1', '0', '0'], ['0', '1', '0', '0', '0', '1']],
    'Rotate about x, then about z': [['0', '-1', '0', '1', '0', '0'], ['1', '0', '0', '0', '0', '-1'], ['0', '0', '1', '0', '1', '0']],
    'Flatten, then scale (det = 0)': [['2', '0', '0', '1', '0', '0'], ['0', '1', '0', '0', '1', '0'], ['0', '0', '1', '0', '0', '0']],
  },
};

const BASIS_CSS = BASIS_COLORS.map((c) => `#${c.toString(16).padStart(6, '0')}`);
const identity = (n: number) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
const toNumbers = (M: Rows) => M.map((r) => r.map((f) => f.toNumber()));
const lerp = (X: number[][], Y: number[][], t: number) => X.map((r, i) => r.map((x, j) => x + (Y[i][j] - x) * t));

function phaseOf(line: number): string {
  switch (line) {
    case LINES.start: return 'Setup';
    case LINES.applyB: return 'First B';
    case LINES.applyA: return 'Then A';
    case LINES.loopJ:
    case LINES.column: return 'Column picture';
    case LINES.loopI:
    case LINES.entry: return 'Row × column';
    case LINES.det: return 'Determinant';
    default: return 'Result';
  }
}

/** "Matrix multiplication" section: AB as "first B, then A", stepped through beside the moving grid. */
export function mountMultiplication(root: HTMLElement): () => void {
  const stepper = new Stepper(root, {
    presets: PRESETS,
    blocks: [
      { label: 'A', width: 'n' },
      { label: 'B', width: 'n' },
    ],
    stateTitle: 'A × B',
    views: [{ id: 'grid', label: 'Grid' }],
    camera3D: [5, 4, 6.5],
  });
  const geometry = new MultiplyGeometry(stepper.viewport);

  let n: Dimension = 2;
  let trace: Trace;
  let num: { I: number[][]; A: number[][]; B: number[][]; AB: number[][] };

  function geoNote(s: Step): string {
    const basis = BASIS_NAMES.slice(0, n).join(', ');
    const shape = n === 2 ? 'square' : 'cube';
    switch (s.line) {
      case LINES.start:
        return `The coloured arrows are ${basis}; the blue grid is space. Watch it move twice: first by B, then by A.`;
      case LINES.applyB:
        return `The grid moves by B. The arrows end on the columns of B.`;
      case LINES.applyA:
        return `A now moves the already-moved grid. The faint arrows mark where B left ${basis}; the bright ones end on the columns of AB.`;
      case LINES.loopJ:
      case LINES.column:
        return `The path walks B's column ${s.buildColumn! + 1} as a recipe along A's columns and lands exactly on the tip of column ${s.buildColumn! + 1} of AB.`;
      case LINES.loopI:
      case LINES.entry:
        return s.projectRow === undefined
          ? 'Each entry of that column can also be found on its own.'
          : `The dashed line reads coordinate ${s.projectRow + 1} off column ${s.buildColumn! + 1} of AB: one row of A times one column of B.`;
      case LINES.det:
        return `Dashed outline: the unit ${shape} after B alone. Filled: after B and then A. Each move multiplies the ${n === 2 ? 'area' : 'volume'} by its own determinant.`;
      default:
        return 'AB is a single matrix that does both moves at once. Swapping the order generally lands somewhere else.';
    }
  }

  function renderState(s: Step): void {
    const { A, B, AB } = trace;
    const table = (M: Rows, opts: { head: string[]; colored?: boolean; cell: (i: number, j: number) => string; rowCls?: (i: number) => string; hidden?: (j: number) => boolean }) => {
      const head = opts.head
        .map((h, j) => `<th style="${opts.colored ? `color:${BASIS_CSS[j]}` : ''}" class="${opts.hidden?.(j) ? 'dim' : ''}">${h}</th>`)
        .join('');
      const body = M.map(
        (row, i) =>
          `<tr class="${opts.rowCls?.(i) ?? ''}">${row
            .map((f, j) => `<td class="${opts.cell(i, j)}">${opts.hidden?.(j) ? '?' : f.format()}</td>`)
            .join('')}</tr>`,
      ).join('');
      return `<table class="aug"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
    };
    const blank = Array.from({ length: n }, () => ' '); // keeps A's rows level with B's
    stepper.state.innerHTML = `
      <div class="product">
        <div class="labeled">${table(A, { head: blank, cell: () => '', rowCls: (i) => (s.focusRow === i ? 'focus' : '') })}<span>A</span></div>
        <span class="op">·</span>
        <div class="labeled">${table(B, {
          head: BASIS_NAMES.slice(0, n).map((b) => `${b}`),
          colored: true,
          cell: (_, j) => (s.focusCol === j ? 'col' : ''),
        })}<span>B</span></div>
        <span class="op">=</span>
        <div class="labeled">${table(AB, {
          head: BASIS_NAMES.slice(0, n).map((b) => `${b}`),
          colored: true,
          hidden: (j) => j >= s.revealedCols,
          cell: (i, j) => ['av', s.focusCol === j && s.focusRow === i ? 'pivot' : s.focusCol === j ? 'col' : ''].join(' '),
        })}<span class="av-head">AB</span></div>
      </div>
      <p class="det-line">det A = <b>${trace.detA.format()}</b> · det B = <b>${trace.detB.format()}</b></p>`;
  }

  const stageMatrix = (s: Step) => (s.stage === 'identity' ? num.I : s.stage === 'B' ? num.B : num.AB);

  function frameOf(s: Step, matrix = stageMatrix(s), columnProgress = 1): Frame {
    return {
      matrix,
      ghostB: s.stage === 'AB' && s.line !== LINES.applyB,
      buildColumn: s.buildColumn,
      columnProgress: s.line === LINES.loopJ ? 0 : columnProgress,
      projectRow: s.projectRow,
      showDet: s.showDet,
    };
  }

  function draw(f: Frame): void {
    const det = geometry.draw(f);
    stepper.setReadout(`det = ${Math.abs(det) < 5e-4 ? '0.000' : det.toFixed(3)}`);
  }

  stepper.start({
    load(size, rows) {
      n = size;
      trace = traceMultiplication(rows);
      num = { I: identity(n), A: toNumbers(trace.A), B: toNumbers(trace.B), AB: toNumbers(trace.AB) };
      geometry.build(n, num.A, num.B);
      return { code: trace.code, steps: trace.steps.length };
    },

    show(k, animate) {
      const s = trace.steps[k];
      stepper.setLine(s.line);
      stepper.setPhase(phaseOf(s.line));
      stepper.setNote(s.note);
      stepper.setCalc(s.calc);
      stepper.setVars(s.vars);
      stepper.setGeo(geoNote(s));
      renderState(s);

      if (animate && s.motion) return 1600;
      if (animate && s.growColumn) return 1300;
      draw(frameOf(s));
      return 0;
    },

    frame(k, t) {
      const s = trace.steps[k];
      if (s.motion === 'applyB') draw(frameOf(s, lerp(num.I, num.B, t)));
      // Apply a partial A on top of B, so the second move visibly starts from where B left off.
      else if (s.motion === 'applyA') draw(frameOf(s, matMul(lerp(num.I, num.A, t), num.B)));
      else draw(frameOf(s, stageMatrix(s), t));
    },

    viewChanged(k) {
      draw(frameOf(trace.steps[k]));
    },
  });

  return () => {
    geometry.dispose();
    stepper.dispose();
  };
}
