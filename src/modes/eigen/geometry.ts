import * as THREE from 'three';
import { disposeChildren, type Viewport } from '../../core/viewport';
import { createAxes, createGrid, type Dimension } from '../../scene/grid';
import { VectorArrow } from '../../scene/basis';

/** One colour per eigenvalue (validated as a categorical palette on the dark surface). */
export const EIGEN_COLORS = [0xd97706, 0xa855f7, 0x0891b2];
export const EIGEN_CSS = EIGEN_COLORS.map((c) => `#${c.toString(16).padStart(6, '0')}`);

const ALIGNED = 0xfacc15;
const OFF_LINE = 0x64748b;
const AV_COLOR = 0xf472b6;
const FAN_LENGTH = 1.5;
const MAX_FAN = 24;

export interface Frame {
  matrix: number[][];
  fan: boolean;
  /** 2D search: angle of the sweeping unit vector v. */
  sweepAngle?: number;
  /** Which eigen lines are drawn, per pair. */
  linesVisible: boolean[];
  pair?: number;
  vectors: 'none' | 'null' | 'check' | 'all';
}

function toMatrix3(M: number[][]): THREE.Matrix3 {
  const m = new THREE.Matrix3();
  if (M.length === 2) m.set(M[0][0], M[0][1], 0, M[1][0], M[1][1], 0, 0, 0, 1);
  else m.set(M[0][0], M[0][1], M[0][2], M[1][0], M[1][1], M[1][2], M[2][0], M[2][1], M[2][2]);
  return m;
}

const vec3 = (v: number[]) => new THREE.Vector3(v[0], v[1], v[2] ?? 0);

/** True when w points along v or straight back (and isn't 0). */
function sameLine(v: THREE.Vector3, w: THREE.Vector3): boolean {
  const lw = w.length();
  return lw > 1e-6 && new THREE.Vector3().crossVectors(v, w).length() / (v.length() * lw) < 0.012;
}

export class EigenGeometry {
  private A = new THREE.Matrix3();
  private pairs: { color: number; vectors: THREE.Vector3[]; lambda: number }[] = [];
  private fanDirs: THREE.Vector3[] = [];

  private readonly reference = new THREE.Group();
  private readonly transformed = new THREE.Group();
  private readonly fan = Array.from({ length: MAX_FAN }, () => new VectorArrow(OFF_LINE));
  private readonly sweepV = new VectorArrow(0xf8fafc);
  private readonly sweepAv = new VectorArrow(AV_COLOR);
  /** Up to 3 eigenvector basis vectors overall, each with v, λv and its line. */
  private readonly eigenV = EIGEN_COLORS.map(() => new VectorArrow(EIGEN_COLORS[0]));
  private readonly eigenAv = EIGEN_COLORS.map(() => new VectorArrow(AV_COLOR));
  private readonly lines: THREE.Line[];
  private readonly origin: THREE.Mesh;

  constructor(private readonly viewport: Viewport) {
    this.transformed.matrixAutoUpdate = false;
    this.lines = EIGEN_COLORS.map(() => {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-10, 0, 0), new THREE.Vector3(10, 0, 0)]);
      const line = new THREE.Line(g, new THREE.LineDashedMaterial({ dashSize: 0.18, gapSize: 0.12, transparent: true }));
      line.computeLineDistances();
      return line;
    });
    this.origin = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), new THREE.MeshBasicMaterial({ color: AV_COLOR, transparent: true }));

    const overlays = [
      ...[...this.fan, this.sweepV, this.sweepAv, ...this.eigenAv].map((a) => a.object),
      ...this.lines,
      this.origin,
    ];
    // Draw above the grids; eigenvectors above their images so both stay visible when they overlap.
    overlays.forEach((o) => o.traverse((c) => (c.renderOrder = 1)));
    this.eigenV.forEach((a) => a.object.traverse((c) => (c.renderOrder = 2)));
    viewport.scene.add(this.reference, this.transformed, ...overlays, ...this.eigenV.map((a) => a.object));
  }

  build(n: Dimension, A: number[][], pairs: { vectors: number[][]; lambda: number }[]): void {
    this.viewport.setDimension(n);
    this.A = toMatrix3(A);
    this.pairs = pairs.map((p, k) => ({ color: EIGEN_COLORS[k], lambda: p.lambda, vectors: p.vectors.map(vec3) }));
    disposeChildren(this.reference);
    disposeChildren(this.transformed);

    if (n === 2) {
      this.reference.add(createGrid(2, 20, 0x1e293b, 1), createAxes(2, 40, 3.8));
      this.transformed.add(createGrid(2, 12, 0x38bdf8, 0.4));
    } else {
      this.reference.add(createAxes(3, 4.5, 4.9));
      this.transformed.add(createGrid(3, 1, 0x38bdf8, 0.22));
    }

    // A fan of directions, plus the eigen-directions so some of the fan visibly stays put.
    const dirs: THREE.Vector3[] = [];
    if (n === 2) for (let k = 0; k < 16; k++) dirs.push(new THREE.Vector3(Math.cos((k * Math.PI) / 8), Math.sin((k * Math.PI) / 8), 0));
    else {
      for (const s of [1, -1]) for (let a = 0; a < 3; a++) dirs.push(new THREE.Vector3().setComponent(a, s));
      for (const x of [1, -1]) for (const y of [1, -1]) for (const z of [1, -1]) dirs.push(new THREE.Vector3(x, y, z).normalize());
    }
    for (const p of this.pairs) for (const v of p.vectors) dirs.push(v.clone(), v.clone().negate());
    this.fanDirs = dirs.filter((d, i) => dirs.findIndex((e) => e.distanceTo(d) < 1e-6) === i).slice(0, MAX_FAN);

    // Eigen lines, one per basis vector of each eigenspace.
    let slot = 0;
    for (const p of this.pairs)
      for (const v of p.vectors) {
        const line = this.lines[slot++];
        (line.material as THREE.LineDashedMaterial).color.setHex(p.color);
        line.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), v.clone().normalize());
      }
  }

  /** Draws a frame and returns det of its matrix. */
  draw(f: Frame): number {
    const m3 = toMatrix3(f.matrix);
    this.transformed.matrix.setFromMatrix3(m3);
    this.transformed.matrixWorldNeedsUpdate = true;

    // Fan: each vector rides with the grid; gold while it is still on its own line.
    this.fan.forEach((a, i) => {
      const d = this.fanDirs[i];
      if (!f.fan || !d) {
        a.object.visible = false;
        return;
      }
      const v = d.clone().multiplyScalar(FAN_LENGTH);
      const mv = v.clone().applyMatrix3(m3);
      a.set(mv);
      a.object.setColor(sameLine(v, mv) ? ALIGNED : OFF_LINE);
    });

    // Sweep: v goes round the circle, Av follows; both turn gold when they line up.
    const sweeping = f.sweepAngle !== undefined;
    this.sweepV.object.visible = this.sweepAv.object.visible = sweeping;
    if (sweeping) {
      const v = new THREE.Vector3(Math.cos(f.sweepAngle!), Math.sin(f.sweepAngle!), 0).multiplyScalar(FAN_LENGTH);
      const av = v.clone().applyMatrix3(this.A);
      const hit = sameLine(v, av);
      this.sweepV.set(v);
      this.sweepAv.set(av);
      this.sweepV.object.setColor(hit ? ALIGNED : 0xf8fafc);
      this.sweepAv.object.setColor(hit ? ALIGNED : AV_COLOR);
    }

    // Eigen lines and eigenvectors.
    let slot = 0;
    this.lines.forEach((l) => (l.visible = false));
    this.eigenV.forEach((a) => (a.object.visible = false));
    this.eigenAv.forEach((a) => (a.object.visible = false));
    this.origin.visible = false;
    this.pairs.forEach((p, k) => {
      for (const v of p.vectors) {
        const s = slot++;
        this.lines[s].visible = f.linesVisible[k] ?? false;
        const focus = f.vectors === 'all' || (f.pair === k && f.vectors !== 'none');
        if (!focus) continue;
        const shown = v.clone().multiplyScalar(FAN_LENGTH);
        this.eigenV[s].set(shown);
        this.eigenV[s].object.setColor(p.color); // colour follows the eigenvalue, not the slot
        if (f.vectors === 'null') this.origin.visible = true;
        else {
          this.eigenAv[s].set(shown.clone().multiplyScalar(p.lambda));
          if (Math.abs(p.lambda) < 1e-9) this.origin.visible = true; // Av = 0·v sits at the origin
        }
      }
    });

    return m3.determinant();
  }

  dispose(): void {
    disposeChildren(this.reference);
    disposeChildren(this.transformed);
  }
}
