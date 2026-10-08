import * as THREE from 'three';
import { disposeChildren, type Viewport } from '../../core/viewport';
import { createAxes, createGrid, createUnitShape, type Dimension } from '../../scene/grid';
import { BASIS_COLORS, VectorArrow } from '../../scene/basis';

const GUIDE_COLOR = 0xf472b6;

export interface Frame {
  /** The composite transformation currently drawn (n×n, row-major). */
  matrix: number[][];
  /** Faint arrows where B left the basis vectors. */
  ghostB: boolean;
  /** Column j of AB drawn as Σ_k B_kj · (column k of A), head to tail. */
  buildColumn?: number;
  columnProgress: number;
  projectRow?: number;
  /** Highlight the image of the unit square/cube, with B's image outlined for comparison. */
  showDet: boolean;
}

export const matMul = (X: number[][], Y: number[][]) => X.map((row) => Y[0].map((_, j) => row.reduce((s, x, k) => s + x * Y[k][j], 0)));

function toMatrix3(M: number[][]): THREE.Matrix3 {
  const m = new THREE.Matrix3();
  if (M.length === 2) m.set(M[0][0], M[0][1], 0, M[1][0], M[1][1], 0, 0, 0, 1);
  else m.set(M[0][0], M[0][1], M[0][2], M[1][0], M[1][1], M[1][2], M[2][0], M[2][1], M[2][2]);
  return m;
}

/** Composite transformations: the grid through B, then through AB, with the columns of AB built from A's columns. */
export class MultiplyGeometry {
  private n: Dimension = 2;
  private A = new THREE.Matrix3();
  private B = new THREE.Matrix3();
  private readonly reference = new THREE.Group();
  private readonly transformed = new THREE.Group();
  /** Outline of the unit square/cube under B alone. */
  private readonly bShape = new THREE.Group();
  private unitMaterial: THREE.MeshBasicMaterial | null = null;

  private readonly basis = BASIS_COLORS.map((c) => new VectorArrow(c));
  private readonly ghosts = BASIS_COLORS.map((c) => new VectorArrow(c, 0.3));
  private readonly components = BASIS_COLORS.map((c) => new VectorArrow(c, 0.85));
  private readonly projection: THREE.Line;
  private readonly projectionDot: THREE.Mesh;

  constructor(private readonly viewport: Viewport) {
    this.transformed.matrixAutoUpdate = false;
    this.bShape.matrixAutoUpdate = false;

    const projGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.projection = new THREE.Line(projGeometry, new THREE.LineDashedMaterial({ color: GUIDE_COLOR, dashSize: 0.15, gapSize: 0.1 }));
    this.projectionDot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), new THREE.MeshBasicMaterial({ color: GUIDE_COLOR }));

    const overlays = [
      ...[...this.basis, ...this.ghosts, ...this.components].map((a) => a.object),
      this.projection,
      this.projectionDot,
      this.bShape,
    ];
    // Arrows and guides often lie exactly on grid lines; draw them after the grids so they stay on top.
    overlays.forEach((o) => o.traverse((c) => (c.renderOrder = 1)));
    viewport.scene.add(this.reference, this.transformed, ...overlays);
  }

  build(n: Dimension, A: number[][], B: number[][]): void {
    this.n = n;
    this.viewport.setDimension(n);
    this.A = toMatrix3(A);
    this.B = toMatrix3(B);
    disposeChildren(this.reference);
    disposeChildren(this.transformed);
    disposeChildren(this.bShape);

    if (n === 2) {
      this.reference.add(createGrid(2, 20, 0x1e293b, 1), createAxes(2, 40, 3.8));
      this.transformed.add(createGrid(2, 12, 0x38bdf8, 0.45));
    } else {
      this.reference.add(createAxes(3, 4.5, 4.9));
      this.transformed.add(createGrid(3, 1, 0x38bdf8, 0.22));
    }
    const unit = createUnitShape(n);
    this.unitMaterial = (unit.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material;
    this.transformed.add(unit);

    // Just the edges of the unit shape, drawn through B.
    const [face, edges] = createUnitShape(n).children as [THREE.Mesh, THREE.LineSegments];
    disposeChildren(face);
    (edges.material as THREE.Material).dispose();
    edges.material = new THREE.LineDashedMaterial({ color: 0xfacc15, dashSize: 0.12, gapSize: 0.08 });
    edges.computeLineDistances();
    edges.renderOrder = 1;
    this.bShape.add(edges);
    this.bShape.matrix.setFromMatrix3(this.B);
    this.bShape.matrixWorldNeedsUpdate = true;
  }

  /** Draws a frame and returns det of its matrix. */
  draw(f: Frame): number {
    const n = this.n;
    const m3 = toMatrix3(f.matrix);
    this.transformed.matrix.setFromMatrix3(m3);
    this.transformed.matrixWorldNeedsUpdate = true;

    const columns = (m: THREE.Matrix3) => [0, 1, 2].map((c) => new THREE.Vector3().setFromMatrix3Column(m, c));
    const cols = columns(m3);
    this.basis.forEach((a, c) => {
      a.set(cols[c]);
      a.object.visible &&= c < n;
    });
    const bCols = columns(this.B);
    this.ghosts.forEach((a, c) => {
      a.set(bCols[c]);
      a.object.visible &&= c < n && f.ghostB;
    });

    // Column j of AB = Σ_k B_kj · (column k of A), drawn head to tail.
    const aCols = columns(this.A);
    const tip = new THREE.Vector3();
    this.components.forEach((a, k) => {
      const j = f.buildColumn;
      const share = THREE.MathUtils.clamp(f.columnProgress * n - k, 0, 1);
      if (j === undefined || k >= n || share === 0) {
        a.object.visible = false;
        return;
      }
      const seg = aCols[k].clone().multiplyScalar(bCols[j].getComponent(k) * share);
      a.set(seg, tip.clone());
      tip.add(seg);
    });

    // Row picture: a dashed guide from the tip of column j to its i-th coordinate.
    const showProj = f.projectRow !== undefined && f.buildColumn !== undefined;
    this.projection.visible = this.projectionDot.visible = showProj;
    if (showProj) {
      const end = cols[f.buildColumn!];
      const foot = new THREE.Vector3().setComponent(f.projectRow!, end.getComponent(f.projectRow!));
      this.projection.geometry.setFromPoints([end, foot]);
      this.projection.computeLineDistances();
      this.projectionDot.position.copy(foot);
    }

    this.bShape.visible = f.showDet;
    if (this.unitMaterial) this.unitMaterial.opacity = f.showDet ? 0.6 : 0.2;

    return m3.determinant();
  }

  dispose(): void {
    disposeChildren(this.reference);
    disposeChildren(this.transformed);
    disposeChildren(this.bShape);
  }
}
