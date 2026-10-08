import * as THREE from 'three';
import { disposeChildren, type Viewport } from '../../core/viewport';
import { createAxes, createGrid, createLabel, createUnitShape, type Dimension } from '../../scene/grid';
import { BASIS_COLORS, VectorArrow } from '../../scene/basis';

export const V_COLOR = 0xf8fafc;
export const AV_COLOR = 0xf472b6;

/** Everything needed to draw one moment of the walkthrough. */
export interface Frame {
  /** Current transformation (n×n, row-major). */
  matrix: number[][];
  components: 'original' | 'transformed' | null;
  /** 0..1: how much of the head-to-tail component path is drawn. */
  componentProgress: number;
  showAv: boolean;
  ghost: boolean;
  projectRow?: number;
  highlightUnit: boolean;
}

/**
 * The grid drawn through a matrix, its basis vectors, and a vector v that is "glued"
 * to the grid, so it is carried along as the basis vectors move.
 */
export class TransformGeometry {
  private n: Dimension = 2;
  private v = new THREE.Vector3();
  private readonly reference = new THREE.Group();
  /** Drawn through the current matrix. */
  private readonly transformed = new THREE.Group();
  private unitMaterial: THREE.MeshBasicMaterial | null = null;

  private readonly basis = BASIS_COLORS.map((c) => new VectorArrow(c));
  private readonly components = BASIS_COLORS.map((c) => new VectorArrow(c, 0.85));
  private readonly vArrow = new VectorArrow(V_COLOR);
  private readonly ghost = new VectorArrow(V_COLOR, 0.3);
  private readonly avArrow = new VectorArrow(AV_COLOR);
  private readonly vLabel = createLabel('v', '#f8fafc');
  private readonly avLabel = createLabel('Av', '#f472b6');
  private readonly projection: THREE.Line;
  private readonly projectionDot: THREE.Mesh;

  constructor(private readonly viewport: Viewport) {
    this.transformed.matrixAutoUpdate = false;

    const projGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.projection = new THREE.Line(projGeometry, new THREE.LineDashedMaterial({ color: AV_COLOR, dashSize: 0.15, gapSize: 0.1, transparent: true }));
    this.projectionDot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), new THREE.MeshBasicMaterial({ color: AV_COLOR, transparent: true }));

    const overlays = [
      ...[...this.basis, ...this.components, this.vArrow, this.ghost, this.avArrow].map((a) => a.object),
      this.vLabel,
      this.avLabel,
      this.projection,
      this.projectionDot,
    ];
    // Arrows and guides often lie exactly on grid lines; draw them after the grids so they stay on top.
    overlays.forEach((o) => o.traverse((c) => (c.renderOrder = 1)));
    viewport.scene.add(this.reference, this.transformed, ...overlays);
  }

  build(n: Dimension, v: number[]): void {
    this.n = n;
    this.viewport.setDimension(n);
    this.v.set(v[0], v[1], n === 3 ? v[2] : 0);
    disposeChildren(this.reference);
    disposeChildren(this.transformed);

    if (n === 2) {
      this.reference.add(createGrid(2, 20, 0x1e293b, 1), createAxes(2, 40, 3.8));
      this.transformed.add(createGrid(2, 12, 0x38bdf8, 0.45));
    } else {
      this.reference.add(createAxes(3, 4.5, 4.9));
      this.transformed.add(createGrid(3, 2, 0x38bdf8, 0.16));
    }
    const unit = createUnitShape(n);
    this.unitMaterial = (unit.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material;
    this.transformed.add(unit);
  }

  /** Draws a frame and returns det of its matrix. */
  draw(f: Frame): number {
    const n = this.n;
    const m3 = new THREE.Matrix3();
    const M = f.matrix;
    if (n === 2) m3.set(M[0][0], M[0][1], 0, M[1][0], M[1][1], 0, 0, 0, 1);
    else m3.set(M[0][0], M[0][1], M[0][2], M[1][0], M[1][1], M[1][2], M[2][0], M[2][1], M[2][2]);
    this.transformed.matrix.setFromMatrix3(m3);
    this.transformed.matrixWorldNeedsUpdate = true;

    // Columns of the matrix are where the basis vectors land.
    const cols = [0, 1, 2].map((c) => new THREE.Vector3().setFromMatrix3Column(m3, c));
    this.basis.forEach((a, c) => {
      a.set(cols[c]);
      a.object.visible &&= c < n;
    });

    // Head-to-tail path x·b1 + y·b2 (+ z·b3) along the chosen basis.
    const v = [this.v.x, this.v.y, this.v.z];
    const tip = new THREE.Vector3();
    this.components.forEach((a, k) => {
      const share = THREE.MathUtils.clamp(f.componentProgress * n - k, 0, 1);
      if (!f.components || k >= n || share === 0) {
        a.object.visible = false;
        return;
      }
      const b = f.components === 'original' ? new THREE.Vector3().setComponent(k, 1) : cols[k];
      const seg = b.clone().multiplyScalar(v[k] * share);
      a.set(seg, tip.clone());
      tip.add(seg);
    });

    const mv = this.v.clone().applyMatrix3(m3);
    this.vArrow.set(mv);
    this.vArrow.object.visible &&= !f.showAv;
    this.avArrow.set(mv);
    this.avArrow.object.visible &&= f.showAv;
    this.ghost.set(this.v);
    this.ghost.object.visible &&= f.ghost;

    const label = f.showAv ? this.avLabel : this.vLabel;
    const other = f.showAv ? this.vLabel : this.avLabel;
    other.visible = false;
    label.visible = mv.lengthSq() > 1e-6;
    label.position.copy(mv).add(mv.clone().normalize().multiplyScalar(0.35));

    // Row picture: a dashed guide from Av to its i-th coordinate on axis i.
    const showProj = f.projectRow !== undefined;
    this.projection.visible = this.projectionDot.visible = showProj;
    if (showProj) {
      const foot = new THREE.Vector3().setComponent(f.projectRow!, mv.getComponent(f.projectRow!));
      this.projection.geometry.setFromPoints([mv, foot]);
      this.projection.computeLineDistances();
      this.projectionDot.position.copy(foot);
    }

    if (this.unitMaterial) this.unitMaterial.opacity = f.highlightUnit ? 0.6 : 0.2;

    return m3.determinant();
  }

  dispose(): void {
    disposeChildren(this.reference);
    disposeChildren(this.transformed);
  }
}
