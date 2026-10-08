import { Stepper, esc } from '../../core/stepper';
import { VAR_NAMES, type Rows } from '../../math/notation';
import type { Dimension } from '../../scene/grid';
import { BACK_START_LINE, FORWARD_END_LINE, PSEUDOCODE, formatEquation, traceElimination, type Outcome, type Step } from './algorithm';
import { EQUATION_CSS, EliminationGeometry, type GeometryView } from './geometry';

const PRESETS: Record<Dimension, Record<string, string[][]>> = {
  2: {
    'Unique solution': [['2', '1', '5'], ['1', '-1', '1']],
    'Needs a row swap': [['0', '2', '4'], ['1', '1', '3']],
    'Infinitely many solutions': [['1', '2', '3'], ['2', '4', '6']],
    'No solution': [['1', '2', '3'], ['2', '4', '5']],
  },
  3: {
    'Unique solution': [['2', '1', '-1', '8'], ['-3', '-1', '2', '-11'], ['-2', '1', '2', '-3']],
    'Needs a row swap': [['0', '1', '1', '5'], ['1', '1', '1', '6'], ['2', '1', '-1', '1']],
    'Infinitely many solutions': [['1', '1', '1', '3'], ['1', '2', '3', '6'], ['2', '3', '4', '9']],
    'No solution': [['1', '1', '1', '3'], ['1', '2', '3', '6'], ['2', '3', '4', '10']],
  },
};

const toFloat = (rows: Rows) => rows.map((r) => r.map((f) => f.toNumber()));

function phaseOf(line: number): string {
  if (line === 0) return 'Setup';
  if (line <= FORWARD_END_LINE) return 'Forward elimination';
  if (line < BACK_START_LINE) return 'Consistency check';
  if (line < PSEUDOCODE.length - 1) return 'Back substitution';
  return 'Result';
}

/** "Gaussian elimination" section: a step-through interpreter beside a live geometric view. */
export function mountElimination(root: HTMLElement): () => void {
  const stepper = new Stepper(root, {
    presets: PRESETS,
    extraColumn: 'b',
    stateTitle: 'Matrix and equations',
    views: [
      { id: 'rows', label: 'Row picture' },
      { id: 'transform', label: 'Transformation picture' },
    ],
  });
  stepper.state.innerHTML = '<div data-matrix></div><ul class="equations" data-equations></ul>';
  const geometry = new EliminationGeometry(stepper.viewport);

  let n: Dimension = 2;
  let steps: Step[] = [];
  let outcome: Outcome = { kind: 'none', row: 0 };

  const focusOf = (s: Step) => ({ pivotRow: s.pivot?.[0], rows: s.focusRows });

  function renderState(s: Step, prev: Step | undefined): void {
    const head = VAR_NAMES.slice(0, n).map((v) => `<th>${v}</th>`).join('') + '<th class="b">b</th>';
    const body = s.rows
      .map((row, i) => {
        const rowCls = [s.pivot?.[0] === i ? 'pivot-row' : '', s.focusRows.includes(i) ? 'focus' : ''].join(' ');
        const cells = row
          .map((f, j) => {
            const cls = [
              j === n ? 'b' : '',
              s.pivot && s.pivot[0] === i && s.pivot[1] === j ? 'pivot' : '',
              s.focusCol === j ? 'col' : '',
              prev && !prev.rows[i][j].equals(f) ? 'changed' : '',
            ].join(' ');
            return `<td class="${cls}">${f.format()}</td>`;
          })
          .join('');
        return `<tr class="${rowCls}"><th style="color:${EQUATION_CSS[s.order[i]]}">R${i + 1}</th>${cells}</tr>`;
      })
      .join('');
    stepper.$('[data-matrix]').innerHTML = `<table class="aug"><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table>`;
    stepper.$('[data-equations]').innerHTML = s.rows
      .map((row, i) => `<li style="--c:${EQUATION_CSS[s.order[i]]}">${esc(formatEquation(row))}</li>`)
      .join('');
  }

  function geoNote(s: Step): string {
    const shape = n === 2 ? 'line' : 'plane';
    const measure = n === 2 ? 'area' : 'volume';
    const op = s.op;

    if (stepper.view === 'rows') {
      if (stepper.isLast && s.line >= 10) {
        if (outcome.kind === 'unique')
          return `Every ${shape} now lies perpendicular to an axis (each says "one variable = a number"), and they still all meet at the same point: the solution.`;
        if (outcome.kind === 'infinite')
          return n === 2
            ? 'Both equations describe the same line (one row became 0 = 0 and vanished), so every point on it is a solution.'
            : 'At least one equation turned into 0 = 0: it carried no new information. The remaining planes share a whole line (or plane) of points, so there are infinitely many solutions.';
        const bad = outcome.kind === 'none' ? outcome.row + 1 : 0;
        return n === 2
          ? `Row ${bad} has become 0 = d. No point satisfies that, so it has no line at all: as its coefficients shrank to 0, its line slid off to infinity. The original lines were parallel and never meet, so there is no solution.`
          : `Row ${bad} has become 0 = d. No point satisfies that, so its plane slid off to infinity as its coefficients shrank to 0. The planes have no point in common: pairs may cross, but never all three at once.`;
      }
      if (!op) return `Each equation is a ${shape}. A solution is a point on all of them at once, which is where the ${shape}s meet.`;
      if (op.kind === 'swap') return `Swapping two equations only changes their order. No ${shape} moves, so the solutions are unchanged.`;
      if (op.kind === 'scale')
        return `Dividing an equation by ${op.divisor.format()} doesn't change which points satisfy it, so the ${shape} stays exactly where it is.`;
      const v = VAR_NAMES[op.col];
      const result = s.rows[op.target];
      const what = `Row ${op.target + 1} becomes itself minus ${op.factor.formatFactor()} × row ${op.source + 1}.`;
      if (result.slice(0, n).every((f) => f.isZero())) {
        return result[n].isZero()
          ? `${what} The two rows described the same ${shape}, so what's left is 0 = 0. Every point satisfies that, so the ${shape} disappears: it never added any information.`
          : `${what} The two ${shape}s were parallel, so every variable cancels but the right-hand side doesn't. As the coefficients shrink to 0 the ${shape} slides off to infinity, leaving 0 = d, which no point satisfies.`;
      }
      return (
        `${what} Any point on both ${shape}s still satisfies the new equation, so the ${shape} swings around where they meet` +
        `${n === 3 ? ' (a white line)' : ''} and the ${outcome.kind === 'unique' ? 'solution never moves' : 'set of solutions never changes'}. ` +
        `With no ${v} term left, it ends up parallel to the ${v}-axis.`
      );
    }

    if (stepper.isLast && s.line >= 10 && outcome.kind !== 'unique')
      return `A is singular (det = 0): it squashes space flat. So b is either unreachable (no solution) or hit by a whole line of points (infinitely many solutions).`;
    if (!op)
      return `The grid shows A as a transformation: its columns are where î, ĵ${n === 3 ? ', k̂' : ''} land. The pink dot is b. A·x = b holds at every step, so once A becomes I the dot sits exactly on the solution x.`;
    if (op.kind === 'swap')
      return 'A row swap is a reflection. It flips orientation, so det changes sign, and any continuous path from det to −det passes through 0. That is why space flattens halfway through.';
    if (op.kind === 'scale')
      return `Dividing a row by ${op.divisor.format()} scales ${measure} by 1/${op.divisor.format()}, so det is divided by ${op.divisor.format()}.`;
    return `Row replacement is a shear. It slides space along one direction without changing ${measure}, so det stays the same.`;
  }

  function draw(rows: number[][], s: Step): void {
    const det = geometry.update(rows, s.order, focusOf(s));
    stepper.setReadout(stepper.view === 'transform' ? `det A = ${Math.abs(det) < 5e-4 ? '0.000' : det.toFixed(3)}` : null);
  }

  stepper.start({
    load(size, rows) {
      n = size;
      ({ steps, outcome } = traceElimination(rows));
      geometry.build(n, outcome.kind === 'unique' ? outcome.x.map((f) => f.toNumber()) : null);
      return { code: PSEUDOCODE, steps: steps.length };
    },

    show(k, animate) {
      const s = steps[k];
      const prev = steps[k - 1];
      stepper.setLine(s.line);
      stepper.setPhase(phaseOf(s.line));
      stepper.setNote(s.note);
      stepper.setCalc(s.calc);
      stepper.setVars(s.vars);
      stepper.setGeo(geoNote(s));
      renderState(s, prev);

      // A swap or a scaling leaves every line/plane where it was, so only replacements move in the row picture.
      const op = s.op;
      if (animate && prev && op && (stepper.view === 'transform' || op.kind === 'replace')) return 1200;
      draw(toFloat(s.rows), s);
      return 0;
    },

    frame(k, t) {
      const from = toFloat(steps[k - 1].rows);
      const to = toFloat(steps[k].rows);
      draw(from.map((r, i) => r.map((v, j) => v + (to[i][j] - v) * t)), steps[k]);
    },

    viewChanged(k) {
      geometry.setView(stepper.view as GeometryView);
      draw(toFloat(steps[k].rows), steps[k]);
      stepper.setGeo(geoNote(steps[k]));
    },
  });

  return () => {
    geometry.dispose();
    stepper.dispose();
  };
}
