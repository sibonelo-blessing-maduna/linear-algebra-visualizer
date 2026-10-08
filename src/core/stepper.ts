import { Viewport } from './viewport';
import { Fraction } from '../math/fraction';
import { easeInOutCubic } from '../math/matrix';
import { VAR_NAMES, type Rows } from '../math/notation';
import type { Dimension } from '../scene/grid';

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface StepperConfig {
  /** Examples per size, as rows of an n×(n+1) matrix [A | extra column]. */
  presets: Record<Dimension, Record<string, string[][]>>;
  /** Name of the extra column, e.g. "b" for [A | b]. */
  extraColumn: string;
  /** Title of the card holding section-specific state (matrix, equations, …). */
  stateTitle: string;
  views: { id: string; label: string }[];
  halfHeight2D?: number;
  camera3D?: [number, number, number];
}

export interface StepperHooks {
  /** A new system was loaded. Build geometry, trace the algorithm and return the pseudocode and step count. */
  load(n: Dimension, rows: Rows): { code: string[]; steps: number };
  /**
   * Show step k: update the panel and draw the step's final geometry, or, if `animate`,
   * return how long (ms at speed 1) the geometry should animate into it via `frame`.
   */
  show(k: number, animate: boolean): number;
  /** One animation frame of step k, with eased progress t ∈ [0, 1]. */
  frame(k: number, t: number): void;
  /** The geometry view was switched; redraw step k. */
  viewChanged(k: number): void;
}

const TEMPLATE = (cfg: StepperConfig) => /* html */ `
<div class="stepper">
  <aside class="stepper-panel">
    <section class="card editor">
      <div class="editor-bar">
        <label>Size <select data-size><option value="2">2 × 2</option><option value="3">3 × 3</option></select></label>
        <label>Example <select data-preset></select></label>
        <button class="btn" data-custom-toggle aria-expanded="false">Custom…</button>
      </div>
      <div class="custom" data-custom hidden>
        <div class="matrix-input" data-inputs></div>
        <div class="editor-bar">
          <button class="btn primary" data-load>Run on this input</button>
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
      <h2>${esc(cfg.stateTitle)}</h2>
      <div data-state></div>
    </section>
  </aside>

  <div class="stepper-stage">
    <div class="viewport" data-viewport></div>
    <div class="stage-top" ${cfg.views.length < 2 ? 'hidden' : ''}>
      <div class="seg">
        ${cfg.views.map((v, i) => `<button data-view="${v.id}" class="${i === 0 ? 'on' : ''}">${esc(v.label)}</button>`).join('')}
      </div>
    </div>
    <div class="stage-note">
      <div class="readout" data-readout></div>
      <p data-geo></p>
    </div>
  </div>
</div>`;

/**
 * Shared shell for "interpreter + geometry" sections: an input editor, playback controls,
 * pseudocode with the current line highlighted, narration, and a Three.js stage.
 * The section supplies the algorithm and the drawing through StepperHooks.
 */
export class Stepper {
  readonly viewport: Viewport;
  readonly state: HTMLElement;
  n: Dimension = 2;
  view: string;
  idx = 0;

  private hooks!: StepperHooks;
  private count = 0;
  private codeLines: HTMLElement[] = [];
  private playing = false;
  private speed = 1;
  private nextAt = 0;
  private anim: { start: number; duration: number } | null = null;
  private readonly offKey: () => void;

  constructor(
    private readonly root: HTMLElement,
    private readonly cfg: StepperConfig,
  ) {
    root.innerHTML = TEMPLATE(cfg);
    this.viewport = new Viewport(this.$('[data-viewport]'), cfg.halfHeight2D ?? 5, cfg.camera3D ?? [9, 7, 12]);
    this.state = this.$('[data-state]');
    this.view = cfg.views[0].id;

    // Editor
    const size = this.$<HTMLSelectElement>('[data-size]');
    size.addEventListener('change', () => {
      this.n = Number(size.value) as Dimension;
      this.fillPresets();
      this.loadPreset();
    });
    this.$('[data-preset]').addEventListener('change', () => this.loadPreset());
    this.$('[data-load]').addEventListener('click', () => this.run());
    this.$('[data-inputs]').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.run();
    });
    const toggle = this.$('[data-custom-toggle]');
    toggle.addEventListener('click', () => {
      const custom = this.$('[data-custom]');
      custom.hidden = !custom.hidden;
      toggle.setAttribute('aria-expanded', String(!custom.hidden));
    });

    // Playback
    const actions: Record<string, () => void> = {
      reset: () => (this.setPlaying(false), this.goTo(0, false)),
      back: () => (this.setPlaying(false), this.goTo(this.idx - 1, false)),
      play: () => this.setPlaying(!this.playing),
      forward: () => (this.setPlaying(false), this.goTo(this.idx + 1, true)),
      end: () => (this.setPlaying(false), this.goTo(this.count - 1, false)),
    };
    root.querySelectorAll<HTMLElement>('[data-act]').forEach((b) => b.addEventListener('click', () => actions[b.dataset.act!]()));
    const speed = this.$<HTMLInputElement>('[data-speed]');
    speed.addEventListener('input', () => (this.speed = Number(speed.value)));

    const onKey = (e: KeyboardEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('input, select, textarea')) return;
      if (e.key === ' ' && target?.closest('button')) return; // a focused button already handles Space itself
      const keys: Record<string, string> = { ' ': 'play', ArrowRight: 'forward', ArrowLeft: 'back', Home: 'reset', End: 'end' };
      const act = keys[e.key];
      if (!act) return;
      e.preventDefault();
      actions[act]();
    };
    window.addEventListener('keydown', onKey);
    this.offKey = () => window.removeEventListener('keydown', onKey);

    // Views
    const viewButtons = root.querySelectorAll<HTMLElement>('[data-view]');
    viewButtons.forEach((b) =>
      b.addEventListener('click', () => {
        this.view = b.dataset.view!;
        viewButtons.forEach((o) => o.classList.toggle('on', o === b));
        this.anim = null;
        this.hooks.viewChanged(this.idx);
      }),
    );

    this.viewport.onFrame((now) => this.tick(now));
  }

  $<T extends HTMLElement = HTMLElement>(sel: string): T {
    return this.root.querySelector<T>(sel)!;
  }

  /** Attach the section and load its first example. */
  start(hooks: StepperHooks): void {
    this.hooks = hooks;
    this.fillPresets();
    this.loadPreset();
  }

  get isLast(): boolean {
    return this.idx === this.count - 1;
  }

  // ---------- Panel setters ----------

  setPhase(text: string): void {
    this.$('[data-phase]').textContent = text;
  }

  setNote(text: string): void {
    this.$('[data-note]').textContent = text;
  }

  setCalc(lines: string[]): void {
    const calc = this.$('[data-calc]');
    calc.textContent = lines.join('\n');
    calc.hidden = lines.length === 0;
  }

  setVars(vars: Record<string, string>): void {
    this.$('[data-vars]').innerHTML = Object.entries(vars)
      .map(([k, v]) => `<span class="var"><b>${esc(k)}</b> = ${esc(v)}</span>`)
      .join('');
  }

  setGeo(text: string): void {
    this.$('[data-geo]').textContent = text;
  }

  setReadout(text: string | null): void {
    const el = this.$('[data-readout]');
    el.hidden = text === null;
    if (text !== null) el.textContent = text;
  }

  /** Shows step k: highlights its pseudocode line and lets the section fill in the rest. */
  goTo(k: number, animate: boolean): void {
    if (k < 0 || k >= this.count) return;
    this.idx = k;
    this.$('[data-counter]').textContent = `${k + 1} / ${this.count}`;
    const duration = this.hooks.show(k, animate && k > 0) / this.speed;
    const now = performance.now();
    this.anim = duration > 0 ? { start: now, duration } : null;
    this.nextAt = now + duration + (duration > 0 ? 900 : 550) / this.speed;
  }

  setLine(line: number): void {
    this.codeLines.forEach((el, i) => el.classList.toggle('active', i === line));
  }

  // ---------- Internals ----------

  private tick(now: number): void {
    if (this.anim) {
      const t = Math.min(1, (now - this.anim.start) / this.anim.duration);
      this.hooks.frame(this.idx, easeInOutCubic(t));
      if (t >= 1) this.anim = null;
    }
    if (this.playing && !this.anim && now >= this.nextAt) {
      if (this.isLast) this.setPlaying(false);
      else this.goTo(this.idx + 1, true);
    }
  }

  private setPlaying(on: boolean): void {
    this.playing = on;
    this.$('[data-act="play"]').textContent = on ? '⏸ Pause' : '▶ Play';
    if (on && this.isLast) this.goTo(0, false);
  }

  private fillPresets(): void {
    this.$('[data-preset]').innerHTML = Object.keys(this.cfg.presets[this.n])
      .map((k) => `<option>${esc(k)}</option>`)
      .join('');
  }

  private loadPreset(): void {
    const name = this.$<HTMLSelectElement>('[data-preset]').value;
    this.renderInputs(this.cfg.presets[this.n][name]);
    this.run();
  }

  private renderInputs(values: string[][]): void {
    const n = this.n;
    const extra = this.cfg.extraColumn;
    const inputs = this.$('[data-inputs]');
    inputs.style.gridTemplateColumns = `repeat(${n}, minmax(0, 1fr)) 2px minmax(0, 1fr)`;
    const header =
      VAR_NAMES.slice(0, n).map((v) => `<span class="hdr">${v}</span>`).join('') + `<span></span><span class="hdr">${esc(extra)}</span>`;
    const cells = values
      .map((row, i) =>
        row
          .map((v, j) => {
            const bar = j === n ? '<span class="bar"></span>' : '';
            const label = j === n ? `${extra}${i + 1}` : `a${i + 1}${j + 1}`;
            return `${bar}<input data-r="${i}" data-c="${j}" value="${esc(v)}" aria-label="${label}" spellcheck="false">`;
          })
          .join(''),
      )
      .join('');
    inputs.innerHTML = header + cells;
  }

  private readInputs(): Rows | null {
    const rows: Rows = Array.from({ length: this.n }, () => []);
    let ok = true;
    this.$('[data-inputs]')
      .querySelectorAll<HTMLInputElement>('input')
      .forEach((el) => {
        const f = Fraction.parse(el.value);
        el.classList.toggle('invalid', !f);
        if (f) rows[Number(el.dataset.r)][Number(el.dataset.c)] = f;
        else ok = false;
      });
    return ok ? rows : null;
  }

  private run(): void {
    const rows = this.readInputs();
    this.$('[data-error]').textContent = rows ? '' : 'Entries must be numbers like 3, -1/2 or 0.25.';
    if (!rows) return;
    const { code, steps } = this.hooks.load(this.n, rows);
    this.count = steps;
    const codeEl = this.$('[data-code]');
    codeEl.innerHTML = code
      .map((line, i) => `<div class="code-line"><span class="ln">${i + 1}</span><span class="src">${esc(line)}</span></div>`)
      .join('');
    this.codeLines = Array.from(codeEl.children) as HTMLElement[];
    this.setPlaying(false);
    this.goTo(0, false);
  }

  dispose(): void {
    this.offKey();
    this.viewport.dispose();
    this.root.innerHTML = '';
  }
}
