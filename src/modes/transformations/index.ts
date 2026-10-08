import { Stepper } from '../../core/stepper';
import type { Dimension } from '../../scene/grid';
import { BASIS_COLORS } from '../../scene/basis';
import { BASIS_NAMES, traceTransformation, type Step, type Trace } from './algorithm';
import { TransformGeometry, type Frame } from './geometry';

/** Rows of [A | v]. */
const PRESETS: Record<Dimension, Record<string, string[][]>> = {
  2: {
    'General matrix': [['1', '-1', '2'], ['1', '2', '1']],
    Shear: [['1', '1', '2'], ['0', '1', '1']],
    'Rotation by 90°': [['0', '-1', '2'], ['1', '0', '1']],
    Scaling: [['2', '0', '1'], ['0', '1/2', '2']],
    'Reflection (det < 0)': [['-1', '0', '2'], ['0', '1', '1']],
    'Collapse (det = 0)': [['1', '2', '2'], ['1/2', '1', '1']],
  },
  3: {
    'General matrix': [['1', '1', '0', '1'], ['0', '1', '1', '2'], ['1', '0', '1', '1']],
    Shear: [['1', '1', '0', '1'], ['0', '1', '0', '2'], ['0', '0', '1', '1']],
    'Rotation by 90° about z': [['0', '-1', '0', '2'], ['1', '0', '0', '1'], ['0', '0', '1', '1']],
    Scaling: [['2', '0', '0', '1'], ['0', '1/2', '0', '2'], ['0', '0', '3/2', '1']],
    'Reflection (det < 0)': [['-1', '0', '0', '2'], ['0', '1', '0', '1'], ['0', '0', '1', '1']],
    'Collapse (det = 0)': [['1', '0', '1', '1'], ['0', '1', '1', '1'], ['0', '0', '0', '1']],
  },
};

const BASIS_CSS = BASIS_COLORS.map((c) => `#${c.toString(16).padStart(6, '0')}`);

/** "Transformations" section: step through applying a matrix to a vector, beside the moving grid. */
export function mountTransformations(root: HTMLElement): () => void {
  const stepper = new Stepper(root, {
    presets: PRESETS,
    extraColumn: 'v',
    stateTitle: 'Matrix × vector',
    views: [{ id: 'grid', label: 'Grid' }],
  });
  const geometry = new TransformGeometry(stepper.viewport);

  let n: Dimension = 2;
  let trace: Trace;

  function phaseOf(line: number): string {
    const L = trace.lines;
    if (line === L.start) return 'Setup';
    if (line === L.write) return 'Coordinates';
    if (line < L.combine) return 'Moving the basis';
    if (line === L.combine) return 'Column picture';
    if (line === L.loop || line === L.row) return 'Row picture';
    if (line === L.det) return 'Determinant';
    return 'Result';
  }

  function geoNote(s: Step): string {
    const L = trace.lines;
    const basis = BASIS_NAMES.slice(0, n).join(', ');
    if (s.line === L.start) return `White arrow: v. Coloured arrows: the basis vectors ${basis}. The blue grid is space itself; the faint grid behind it stays put for reference.`;
    if (s.line === L.write) return `The coloured arrows walk the recipe head to tail and end exactly at the tip of v.`;
    if (s.line < L.combine) {
      const c = s.line - L.basis;
      return `${BASIS_NAMES[c]} moves to column ${c + 1} of A and drags the grid with it. v is glued to the grid, so it moves too. The faint arrow shows where v started.`;
    }
    if (s.line === L.combine) return `Walking the same recipe along the moved basis vectors lands exactly on Av (pink).`;
    if (s.line === L.loop || s.line === L.row)
      return s.projectRow === undefined
        ? 'Now read the answer coordinate by coordinate.'
        : `The dashed line drops from Av to the ${'xyz'[s.projectRow]}-axis: that's coordinate ${s.projectRow + 1}, computed as one row of A times v.`;
    if (s.line === L.det) return `The highlighted shape is where the unit ${n === 2 ? 'square' : 'cube'} went. Its ${n === 2 ? 'area' : 'volume'} is |det A|, and every other ${n === 2 ? 'area' : 'volume'} scales by the same factor.`;
    return 'Av is where v ends up. Every other point moves the same way, and the grid shows them all at once.';
  }

  function renderState(s: Step): void {
    const { A, v, Av } = trace;
    const head = A.map(
      (_, c) => `<th style="color:${BASIS_CSS[c]}" class="${c < s.revealedCols ? '' : 'dim'}">${BASIS_NAMES[c]}′</th>`,
    ).join('');
    const rowsA = A.map(
      (row, r) =>
        `<tr class="${s.focusRow === r ? 'focus' : ''}">${row
          .map((f, c) => `<td class="${s.focusCol === c ? 'col' : ''}">${f.format()}</td>`)
          .join('')}</tr>`,
    ).join('');
    const rowsV = v.map((f) => `<tr class="${s.focusRow !== undefined ? 'focus' : ''}"><td>${f.format()}</td></tr>`).join('');
    const rowsAv = Av.map(
      (f, r) => `<tr><td class="av ${s.focusRow === r ? 'pivot' : ''}">${s.revealAv ? f.format() : '?'}</td></tr>`,
    ).join('');
    stepper.state.innerHTML = `
      <div class="product">
        <table class="aug"><thead><tr>${head}</tr></thead><tbody>${rowsA}</tbody></table>
        <span class="op">·</span>
        <table class="aug"><thead><tr><th>v</th></tr></thead><tbody>${rowsV}</tbody></table>
        <span class="op">=</span>
        <table class="aug"><thead><tr><th class="av-head">Av</th></tr></thead><tbody>${rowsAv}</tbody></table>
      </div>
      <p class="det-line">det A = <b>${trace.det.format()}</b></p>`;
  }

  function frameOf(s: Step, matrix = s.matrix, componentProgress = 1): Frame {
    return {
      matrix,
      components: s.components,
      componentProgress,
      showAv: s.showAv,
      ghost: s.ghost,
      projectRow: s.projectRow,
      highlightUnit: s.highlightUnit,
    };
  }

  function draw(f: Frame): void {
    const det = geometry.draw(f);
    stepper.setReadout(`det = ${Math.abs(det) < 5e-4 ? '0.000' : det.toFixed(3)}`);
  }

  stepper.start({
    load(size, rows) {
      n = size;
      trace = traceTransformation(rows);
      geometry.build(n, trace.v.map((f) => f.toNumber()));
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

      if (animate && s.movesGrid) return 1400;
      if (animate && s.growComponents) return 1200;
      draw(frameOf(s));
      return 0;
    },

    frame(k, t) {
      const s = trace.steps[k];
      if (s.movesGrid) {
        const from = trace.steps[k - 1].matrix;
        draw(frameOf(s, from.map((r, i) => r.map((x, j) => x + (s.matrix[i][j] - x) * t))));
      } else {
        draw(frameOf(s, s.matrix, t));
      }
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
