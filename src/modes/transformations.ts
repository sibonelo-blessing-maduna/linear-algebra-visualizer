import * as THREE from 'three';
import GUI from 'lil-gui';
import { Viewport, disposeChildren } from '../core/viewport';
import { easeInOutCubic, lerpMatrix3, rowsToMatrix3, toMatrix4, type Rows3 } from '../math/matrix';
import { createGrid, createUnitShape, type Dimension } from '../scene/grid';
import { BASIS_COLORS, VectorArrow } from '../scene/basis';

const PRESETS: Record<string, { d2?: number[]; d3?: number[] }> = {
  Identity: { d2: [1, 0, 0, 1], d3: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
  'Rotate 90°': { d2: [0, -1, 1, 0], d3: [0, -1, 0, 1, 0, 0, 0, 0, 1] },
  Shear: { d2: [1, 1, 0, 1], d3: [1, 1, 0, 0, 1, 0, 0, 0, 1] },
  Scale: { d2: [2, 0, 0, 0.5], d3: [2, 0, 0, 0, 0.5, 0, 0, 0, 1.5] },
  'Reflect (det < 0)': { d2: [-1, 0, 0, 1], d3: [-1, 0, 0, 0, 1, 0, 0, 0, 1] },
  'Collapse (det = 0)': { d2: [1, 2, 0.5, 1], d3: [1, 0, 1, 0, 1, 1, 0, 0, 0] },
};

type Entry = 'm11' | 'm12' | 'm13' | 'm21' | 'm22' | 'm23' | 'm31' | 'm32' | 'm33';
const ENTRIES: Entry[] = ['m11', 'm12', 'm13', 'm21', 'm22', 'm23', 'm31', 'm32', 'm33'];

/** "Linear transformations" section: morph the grid from the identity to a chosen matrix. */
export function mountTransformations(root: HTMLElement): () => void {
  root.innerHTML = `<div class="mode-transform"><div class="viewport"></div><div class="hud"></div></div>`;
  const shell = root.firstElementChild as HTMLElement;
  const hud = shell.querySelector<HTMLElement>('.hud')!;
  const viewport = new Viewport(shell.querySelector<HTMLElement>('.viewport')!);
  const { scene } = viewport;

  // ---------- Scene content ----------

  /** Everything inside this group is drawn through the current matrix. */
  const transformed = new THREE.Group();
  transformed.matrixAutoUpdate = false;

  const reference = new THREE.Group();
  const arrows = BASIS_COLORS.map((c) => new VectorArrow(c));
  scene.add(reference, transformed, ...arrows.map((a) => a.object));

  let dim: Dimension = 2;

  function buildScene(): void {
    disposeChildren(reference);
    disposeChildren(transformed);

    if (dim === 2) {
      reference.add(createGrid(2, 20, 0x334155, 0.6));
      transformed.add(createGrid(2, 20, 0x38bdf8, 0.55), createUnitShape(2));
    } else {
      reference.add(new THREE.AxesHelper(6));
      transformed.add(createGrid(3, 3, 0x38bdf8, 0.18), createUnitShape(3));
    }
  }

  // ---------- Matrix state & animation ----------

  const params = {
    dimension: '2D' as '2D' | '3D',
    m11: 1, m12: 1, m13: 0,
    m21: 0, m22: 1, m23: 0,
    m31: 0, m32: 0, m33: 1,
    duration: 1.5,
    animate: () => animateTo(targetMatrix()),
    reset: () => animateTo(new THREE.Matrix3()),
  };

  function targetMatrix(): THREE.Matrix3 {
    const p = params;
    const r: Rows3 = [
      [p.m11, p.m12, p.m13],
      [p.m21, p.m22, p.m23],
      [p.m31, p.m32, p.m33],
    ];
    if (dim === 2) {
      // A 2x2 matrix acts on the plane; keep z untouched.
      r[0][2] = r[1][2] = r[2][0] = r[2][1] = 0;
      r[2][2] = 1;
    }
    return rowsToMatrix3(r);
  }

  let current = new THREE.Matrix3();
  let anim: { from: THREE.Matrix3; to: THREE.Matrix3; start: number } | null = null;

  function animateTo(to: THREE.Matrix3): void {
    anim = { from: current.clone(), to, start: performance.now() };
  }

  function applyMatrix(m: THREE.Matrix3): void {
    toMatrix4(m, transformed.matrix);
    transformed.matrixWorldNeedsUpdate = true;

    // Columns of the matrix are where the basis vectors land.
    const e = m.elements; // column-major
    for (let c = 0; c < 3; c++) {
      arrows[c].set(new THREE.Vector3(e[c * 3], e[c * 3 + 1], e[c * 3 + 2]));
    }
    arrows[2].object.visible &&= dim === 3;

    updateHud(m);
  }

  const fmt = (x: number) => x.toFixed(2).padStart(6);

  function updateHud(m: THREE.Matrix3): void {
    const e = m.elements;
    // For 2D the third row/column is the identity, so the 3x3 determinant equals the 2x2 one.
    const det = m.determinant();
    const cols = dim === 2 ? [0, 1] : [0, 1, 2];
    const names = ['i', 'j', 'k'];
    const header = cols.map((c) => `<span class="${names[c]}">${names[c].padStart(6)}</span>`).join(' ');
    const rows = cols.map((r) => '[' + cols.map((c) => `<span class="${names[c]}">${fmt(e[c * 3 + r])}</span>`).join(' ') + ' ]');
    const measure = dim === 2 ? 'area' : 'volume';
    hud.innerHTML =
      ` ${header}\n${rows.join('\n')}\n\n` +
      `det = ${det.toFixed(3)}  (${measure} scale${det < 0 ? ', orientation flipped' : ''})`;
  }

  // ---------- GUI ----------

  const gui = new GUI({ title: 'Linear Transformation', container: shell });
  gui.add(params, 'dimension', ['2D', '3D']).name('Space').onChange((v: '2D' | '3D') => setDimension(v === '2D' ? 2 : 3));

  const matrixFolder = gui.addFolder('Matrix A');
  const entryControllers = {} as Record<Entry, ReturnType<GUI['add']>>;
  for (const key of ENTRIES) {
    entryControllers[key] = matrixFolder.add(params, key, -3, 3, 0.1).name(`a${key.slice(1)}`);
  }

  const presetState = { preset: 'Shear' };
  matrixFolder
    .add(presetState, 'preset', Object.keys(PRESETS))
    .name('Preset')
    .onChange((name: string) => {
      const p = PRESETS[name];
      if (dim === 2 && p.d2) {
        const [a, b, c, d] = p.d2;
        Object.assign(params, { m11: a, m12: b, m21: c, m22: d });
      } else if (dim === 3 && p.d3) {
        ENTRIES.forEach((k, i) => (params[k] = p.d3![i]));
      }
      gui.controllersRecursive().forEach((c) => c.updateDisplay());
      params.animate();
    });

  gui.add(params, 'duration', 0.2, 5, 0.1).name('Duration (s)');
  gui.add(params, 'animate').name('▶ Apply A');
  gui.add(params, 'reset').name('↺ Back to identity');

  function setDimension(d: Dimension): void {
    dim = d;
    for (const k of ['m13', 'm23', 'm31', 'm32', 'm33'] as Entry[]) entryControllers[k].show(d === 3);
    viewport.setDimension(d);
    buildScene();
    anim = null;
    current = new THREE.Matrix3();
    applyMatrix(current);
  }

  // ---------- Loop ----------

  viewport.onFrame((now) => {
    if (!anim) return;
    const t = Math.min(1, (now - anim.start) / (params.duration * 1000));
    lerpMatrix3(anim.from, anim.to, easeInOutCubic(t), current);
    applyMatrix(current);
    if (t >= 1) anim = null;
  });

  setDimension(2);
  // Kick off with the default shear so the first thing on screen is a transformation.
  params.animate();

  return () => {
    gui.destroy();
    viewport.dispose();
    root.innerHTML = '';
  };
}
