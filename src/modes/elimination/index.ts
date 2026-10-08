import { Viewport } from '../../core/viewport';
import { Fraction } from '../../math/fraction';
import { easeInOutCubic } from '../../math/matrix';
import type { Dimension } from '../../scene/grid';
import {
  BACK_START_LINE,
  FORWARD_END_LINE,
  PSEUDOCODE,
  VAR_NAMES,
  formatEquation,
  traceElimination,
  type Outcome,
  type Rows,
  type Step,
} from './algorithm';
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

const TEMPLATE = /* html */ `
<div class="elim">
  <aside class="elim-panel">
    <section class="card editor">
      <div class="editor-bar">
        <label>Size <select data-size><option value="2">2 × 2</option><option value="3">3 × 3</option></select></label>
        <label>Example <select data-preset></select></label>
        <button class="btn" data-custom-toggle aria-expanded="false">Custom…</button>
      </div>
      <div class="custom" data-custom hidden>
        <div class="matrix-input" data-inputs></div>
        <div class="editor-bar">
          <button class="btn primary" data-load>Run on this system</button>
          <span class="error" data-error></span>
        </div>
      </div>
    </section>

    <section class="card controls">
      <button class="btn" data-act="reset" title="Restart (Home)">⏮</button>
      <button class="btn" data-act="back" title="Step back (←)">◀</button>
      <button class="btn primary play" data-act="play" title="Play / pause (Space)">▶ Play</button>
      <button class="btn" data-act="forward" title="Step forward (→)">▶</button>
      <button class="btn" data-act="end" title="Jump to the end (End)">⏭</button>
      <label class="speed" title="Playback speed">Speed <input type="range" min="0.25" max="3" step="0.25" value="1" data-speed></label>
      <span class="counter" data-counter></span>
    </section>

    <section class="card">
      <div class="card-head"><h2>Algorithm</h2><span class="phase" data-phase></span></div>
      <div class="code" data-code></div>
    </section>

    <section class="card">
      <h2>What's happening</h2>
      <p class="note" data-note></p>
      <pre class="calc" data-calc></pre>
      <div class="vars" data-vars></div>
    </section>

    <section class="card">
      <h2>Matrix and equations</h2>
      <div data-matrix></div>
      <ul class="equations" data-equations></ul>
    </section>
  </aside>

  <div class="elim-stage">
    <div class="viewport" data-viewport></div>
    <div class="stage-top">
      <div class="seg">
        <button data-view="rows" class="on">Row picture</button>
        <button data-view="transform">Transformation picture</button>
      </div>
    </div>
    <div class="stage-note">
      <div class="det" data-det></div>
      <p data-geo></p>
    </div>
  </div>
</div>`;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const toFloat = (rows: Rows) => rows.map((r) => r.map((f) => f.toNumber()));

/** "Gaussian elimination" section: a step-through interpreter beside a live geometric view. */
export function mountElimination(root: HTMLElement): () => void {
  root.innerHTML = TEMPLATE;
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;

  const viewport = new Viewport($('[data-viewport]'), 5, [9, 7, 12]);
  const geometry = new EliminationGeometry(viewport);

  let n: Dimension = 2;
  let steps: Step[] = [];
  let outcome: Outcome = { kind: 'none', row: 0 };
  let idx = 0;
  let playing = false;
  let speed = 1;
  let nextAt = 0;
  let anim: { from: number[][]; to: number[][]; start: number; duration: number } | null = null;

  const isLast = () => idx === steps.length - 1;
  const focusOf = (s: Step) => ({ pivotRow: s.pivot?.[0], rows: s.focusRows });

  // ---------- System editor ----------

  const sizeSelect = $<HTMLSelectElement>('[data-size]');
  const presetSelect = $<HTMLSelectElement>('[data-preset]');
  const inputs = $('[data-inputs]');
  const error = $('[data-error]');

  function fillPresetOptions(): void {
    presetSelect.innerHTML = Object.keys(PRESETS[n]).map((k) => `<option>${esc(k)}</option>`).join('');
  }

  function renderInputs(values: string[][]): void {
    inputs.style.gridTemplateColumns = `repeat(${n}, minmax(0, 1fr)) 2px minmax(0, 1fr)`;
    const header = VAR_NAMES.slice(0, n).map((v) => `<span class="hdr">${v}</span>`).join('') + '<span></span><span class="hdr">b</span>';
    const cells = values
      .map((row, i) =>
        row
          .map((v, j) => {
            const bar = j === n ? '<span class="bar"></span>' : '';
            const label = j === n ? `b${i + 1}` : `a${i + 1}${j + 1}`;
            return `${bar}<input data-r="${i}" data-c="${j}" value="${esc(v)}" aria-label="${label}" spellcheck="false">`;
          })
          .join(''),
      )
      .join('');
    inputs.innerHTML = header + cells;
  }

  function readInputs(): Rows | null {
    const rows: Rows = Array.from({ length: n }, () => []);
    let ok = true;
    inputs.querySelectorAll<HTMLInputElement>('input').forEach((el) => {
      const f = Fraction.parse(el.value);
      el.classList.toggle('invalid', !f);
      if (f) rows[Number(el.dataset.r)][Number(el.dataset.c)] = f;
      else ok = false;
    });
    return ok ? rows : null;
  }

  function loadPreset(): void {
    renderInputs(PRESETS[n][presetSelect.value]);
    run();
  }

  function run(): void {
    const rows = readInputs();
    error.textContent = rows ? '' : 'Entries must be numbers like 3, -1/2 or 0.25.';
    if (!rows) return;
    ({ steps, outcome } = traceElimination(rows));
    geometry.build(n, outcome.kind === 'unique' ? outcome.x.map((f) => f.toNumber()) : null);
    setPlaying(false);
    goTo(0, false);
  }

  sizeSelect.addEventListener('change', () => {
    n = Number(sizeSelect.value) as Dimension;
    fillPresetOptions();
    loadPreset();
  });
  presetSelect.addEventListener('change', loadPreset);
  $('[data-load]').addEventListener('click', run);
  const customToggle = $('[data-custom-toggle]');
  customToggle.addEventListener('click', () => {
    const custom = $('[data-custom]');
    custom.hidden = !custom.hidden;
    customToggle.setAttribute('aria-expanded', String(!custom.hidden));
  });
  inputs.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') run();
  });

  // ---------- Interpreter panel ----------

  const codeEl = $('[data-code]');
  codeEl.innerHTML = PSEUDOCODE.map(
    (line, i) => `<div class="code-line"><span class="ln">${i + 1}</span><span class="src">${esc(line)}</span></div>`,
  ).join('');
  const codeLines = Array.from(codeEl.children) as HTMLElement[];

  function phaseOf(line: number): string {
    if (line === 0) return 'Setup';
    if (line <= FORWARD_END_LINE) return 'Forward elimination';
    if (line < BACK_START_LINE) return 'Consistency check';
    if (line < PSEUDOCODE.length - 1) return 'Back substitution';
    return 'Result';
  }

  function renderPanel(s: Step, prev: Step | undefined): void {
    codeLines.forEach((el, i) => el.classList.toggle('active', i === s.line));

    $('[data-phase]').textContent = phaseOf(s.line);
    $('[data-counter]').textContent = `${idx + 1} / ${steps.length}`;
    $('[data-note]').textContent = s.note;
    const calc = $('[data-calc]');
    calc.textContent = s.calc.join('\n');
    calc.hidden = s.calc.length === 0;

    const vars = Object.entries(s.vars);
    $('[data-vars]').innerHTML = vars.length
      ? vars.map(([k, v]) => `<span class="var"><b>${esc(k)}</b> = ${esc(v)}</span>`).join('')
      : '';

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
    $('[data-matrix]').innerHTML = `<table class="aug"><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table>`;

    $('[data-equations]').innerHTML = s.rows
      .map((row, i) => `<li style="--c:${EQUATION_CSS[s.order[i]]}">${esc(formatEquation(row))}</li>`)
      .join('');

    renderGeoNote(s);
  }

  // ---------- Geometry commentary ----------

  function renderGeoNote(s: Step): void {
    $('[data-geo]').textContent = geoNote(s);
    $('[data-det]').hidden = geometry.view !== 'transform';
  }

  function geoNote(s: Step): string {
    const shape = n === 2 ? 'line' : 'plane';
    const measure = n === 2 ? 'area' : 'volume';
    const op = s.op;

    if (geometry.view === 'rows') {
      if (isLast() && s.line >= 10) {
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

    if (isLast() && s.line >= 10 && outcome.kind !== 'unique')
      return `A is singular (det = 0): it squashes space flat. So b is either unreachable (no solution) or hit by a whole line of points (infinitely many solutions).`;
    if (!op)
      return `The grid shows A as a transformation: its columns are where î, ĵ${n === 3 ? ', k̂' : ''} land. The pink dot is b. A·x = b holds at every step, so once A becomes I the dot sits exactly on the solution x.`;
    if (op.kind === 'swap')
      return 'A row swap is a reflection. It flips orientation, so det changes sign, and any continuous path from det to −det passes through 0. That is why space flattens halfway through.';
    if (op.kind === 'scale')
      return `Dividing a row by ${op.divisor.format()} scales ${measure} by 1/${op.divisor.format()}, so det is divided by ${op.divisor.format()}.`;
    return `Row replacement is a shear. It slides space along one direction without changing ${measure}, so det stays the same.`;
  }

  // ---------- Playback ----------

  function draw(rows: number[][], s: Step): void {
    const det = geometry.update(rows, s.order, focusOf(s));
    $('[data-det]').textContent = `det A = ${Math.abs(det) < 5e-4 ? '0.000' : det.toFixed(3)}`;
  }

  function goTo(k: number, animate: boolean): void {
    if (k < 0 || k >= steps.length) return;
    const prev = steps[k - 1];
    idx = k;
    const s = steps[k];
    renderPanel(s, prev);

    // A swap or a scaling leaves every line/plane where it was, so only replacements move in the row picture.
    const op = s.op;
    const moves = animate && prev && op && (geometry.view === 'transform' || op.kind === 'replace');
    const now = performance.now();
    const duration = 1200 / speed;
    if (moves) {
      anim = { from: toFloat(prev.rows), to: toFloat(s.rows), start: now, duration };
    } else {
      anim = null;
      draw(toFloat(s.rows), s);
    }
    nextAt = now + (moves ? duration : 0) + (op ? 900 : 550) / speed;
  }

  const playBtn = $('[data-act="play"]');
  function setPlaying(on: boolean): void {
    playing = on;
    playBtn.textContent = on ? '⏸ Pause' : '▶ Play';
    if (on && isLast()) goTo(0, false);
  }

  const actions: Record<string, () => void> = {
    reset: () => (setPlaying(false), goTo(0, false)),
    back: () => (setPlaying(false), goTo(idx - 1, false)),
    play: () => setPlaying(!playing),
    forward: () => (setPlaying(false), goTo(idx + 1, true)),
    end: () => (setPlaying(false), goTo(steps.length - 1, false)),
  };
  root.querySelectorAll<HTMLElement>('[data-act]').forEach((b) => b.addEventListener('click', () => actions[b.dataset.act!]()));

  const speedInput = $<HTMLInputElement>('[data-speed]');
  speedInput.addEventListener('input', () => (speed = Number(speedInput.value)));

  const viewButtons = root.querySelectorAll<HTMLElement>('[data-view]');
  viewButtons.forEach((b) =>
    b.addEventListener('click', () => {
      geometry.setView(b.dataset.view as GeometryView);
      viewButtons.forEach((o) => o.classList.toggle('on', o === b));
      anim = null;
      draw(toFloat(steps[idx].rows), steps[idx]);
      renderGeoNote(steps[idx]);
    }),
  );

  const onKey = (e: KeyboardEvent) => {
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest('input, select, textarea')) return;
    if (e.key === ' ' && target?.closest('button')) return; // a focused button already handles Space itself
    const key: Record<string, string> = { ' ': 'play', ArrowRight: 'forward', ArrowLeft: 'back', Home: 'reset', End: 'end' };
    const act = key[e.key];
    if (!act) return;
    e.preventDefault();
    actions[act]();
  };
  window.addEventListener('keydown', onKey);

  viewport.onFrame((now) => {
    if (anim) {
      const a = anim;
      const t = Math.min(1, (now - a.start) / a.duration);
      const e = easeInOutCubic(t);
      draw(a.from.map((r, i) => r.map((v, j) => v + (a.to[i][j] - v) * e)), steps[idx]);
      if (t >= 1) anim = null;
    }
    if (playing && !anim && now >= nextAt) {
      if (isLast()) setPlaying(false);
      else goTo(idx + 1, true);
    }
  });

  fillPresetOptions();
  loadPreset();

  return () => {
    window.removeEventListener('keydown', onKey);
    geometry.dispose();
    viewport.dispose();
    root.innerHTML = '';
  };
}
