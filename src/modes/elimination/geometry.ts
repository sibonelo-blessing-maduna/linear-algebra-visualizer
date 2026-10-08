import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { disposeChildren, type Viewport } from '../../core/viewport';
import { createAxes, createGrid, createUnitShape, type Dimension } from '../../scene/grid';
import { BASIS_COLORS, VectorArrow } from '../../scene/basis';

/** One colour per equation; equations keep their colour when rows are swapped. */
export const EQUATION_COLORS = [0xf59e0b, 0xc084fc, 0x22d3ee];
export const EQUATION_CSS = EQUATION_COLORS.map((c) => `#${c.toString(16).padStart(6, '0')}`);

export type GeometryView = 'rows' | 'transform';

export interface Focus {
  pivotRow?: number;
  rows: number[];
}

const BOX = 4.5;
/** Keeps infinite planes and lines inside a cube so the 3D scene stays readable. */
const CLIP_BOX = [
  new THREE.Plane(new THREE.Vector3(1, 0, 0), BOX),
  new THREE.Plane(new THREE.Vector3(-1, 0, 0), BOX),
  new THREE.Plane(new THREE.Vector3(0, 1, 0), BOX),
  new THREE.Plane(new THREE.Vector3(0, -1, 0), BOX),
  new THREE.Plane(new THREE.Vector3(0, 0, 1), BOX),
  new THREE.Plane(new THREE.Vector3(0, 0, -1), BOX),
];

const X_AXIS = new THREE.Vector3(1, 0, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const EPS = 1e-9;

/**
 * Draws the system [A | b] in one of two ways:
 *  - rows:      each equation is a line (2D) or plane (3D); the solution is where they meet.
 *  - transform: the coefficient matrix A as a transformation of the grid, with b as a dot.
 */
export class EliminationGeometry {
  view: GeometryView = 'rows';

  private n: Dimension = 2;
  private readonly reference = new THREE.Group();
  private readonly rowGroup = new THREE.Group();
  private readonly transformGroup = new THREE.Group();
  /** Drawn through the current coefficient matrix. */
  private readonly transformed = new THREE.Group();
  private equations: THREE.Object3D[] = [];
  private intersections: THREE.Line[] = [];
  private readonly solutionDot: THREE.Mesh;
  private readonly bDot: THREE.Mesh;
  private readonly arrows = BASIS_COLORS.map((c) => new VectorArrow(c));

  constructor(private readonly viewport: Viewport) {
    this.transformed.matrixAutoUpdate = false;
    this.solutionDot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.solutionDot.renderOrder = 10;
    this.bDot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 16), new THREE.MeshBasicMaterial({ color: 0xf472b6 }));
    this.transformGroup.add(this.transformed, this.bDot, ...this.arrows.map((a) => a.object));
    // Arrows often lie exactly on grid lines; draw them after the grids so they stay on top.
    this.arrows.forEach((a) => a.object.traverse((c) => (c.renderOrder = 1)));
    viewport.scene.add(this.reference, this.rowGroup, this.transformGroup);
  }

  /** Rebuilds the scene for an n×n system. `solution` is drawn as a fixed point in the row picture. */
  build(n: Dimension, solution: number[] | null): void {
    this.n = n;
    this.viewport.setDimension(n);
    this.rowGroup.remove(this.solutionDot); // reused across builds, so keep it out of disposal
    disposeChildren(this.reference);
    disposeChildren(this.rowGroup);
    disposeChildren(this.transformed);
    this.equations = [];
    this.intersections = [];

    const axes = n === 2 ? createAxes(2, 40, 3.8) : createAxes(3, BOX, BOX + 0.4);
    if (n === 2) {
      this.reference.add(createGrid(2, 20, 0x1e293b, 1), axes);
      this.transformed.add(createGrid(2, 12, 0x38bdf8, 0.45), createUnitShape(2));
    } else {
      this.reference.add(axes);
      this.transformed.add(createGrid(3, 2, 0x38bdf8, 0.18), createUnitShape(3));
    }

    for (let id = 0; id < n; id++) {
      const color = EQUATION_COLORS[id];
      if (n === 2) {
        const geometry = new LineGeometry();
        geometry.setPositions([-60, 0, 0.01, 60, 0, 0.01]);
        const line = new Line2(geometry, new LineMaterial({ color, linewidth: 3, transparent: true }));
        this.equations.push(line);
      } else {
        const material = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: false,
          clippingPlanes: CLIP_BOX,
        });
        this.equations.push(new THREE.Mesh(new THREE.PlaneGeometry(4 * BOX, 4 * BOX), material));
      }
    }
    this.rowGroup.add(...this.equations);

    // In 3D, where two planes cross is a line; all three lines meet at the solution.
    if (n === 3) {
      for (let k = 0; k < 3; k++) {
        const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-3 * BOX, 0, 0), new THREE.Vector3(3 * BOX, 0, 0)]);
        const line = new THREE.Line(
          geometry,
          new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, clippingPlanes: CLIP_BOX }),
        );
        this.intersections.push(line);
      }
      this.rowGroup.add(...this.intersections);
    }

    this.solutionDot.visible = solution !== null;
    if (solution) this.solutionDot.position.set(solution[0], solution[1], solution[2] ?? 0);
    this.rowGroup.add(this.solutionDot);
    this.arrows[2].object.visible = n === 3;
    this.setView(this.view);
  }

  setView(view: GeometryView): void {
    this.view = view;
    this.rowGroup.visible = view === 'rows';
    this.transformGroup.visible = view === 'transform';
  }

  /**
   * Shows the augmented matrix `rows` (floating point, rows by position).
   * `order[k]` is the equation id at position k. Returns det of the coefficient matrix.
   */
  update(rows: number[][], order: number[], focus: Focus): number {
    const n = this.n;
    const drawable = (row: number[]) => row.slice(0, n).some((a) => Math.abs(a) > 1e-6);
    // Only dim the others if something highlighted is actually on screen (0 = d rows have no shape).
    const anyFocus = [...focus.rows, focus.pivotRow].some((pos) => pos !== undefined && drawable(rows[pos]));

    rows.forEach((row, pos) => {
      const obj = this.equations[order[pos]];
      const normal = new THREE.Vector3(row[0], row[1], n === 3 ? row[2] : 0);
      const d = row[n];
      const len2 = normal.lengthSq();
      obj.visible = len2 > EPS;
      if (!obj.visible) return;

      // Closest point to the origin satisfying normal·p = d.
      const p0 = normal.clone().multiplyScalar(d / len2);
      const unit = normal.clone().normalize();
      const active = pos === focus.pivotRow || focus.rows.includes(pos);

      if (obj instanceof Line2) {
        obj.position.set(p0.x, p0.y, 0);
        obj.rotation.z = Math.atan2(unit.x, -unit.y); // direction (−b, a) ⟂ normal
        obj.material.linewidth = active ? 5 : 3;
        obj.material.opacity = !anyFocus || active ? 1 : 0.3;
      } else {
        const mesh = obj as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
        mesh.position.copy(p0);
        mesh.quaternion.setFromUnitVectors(Z_AXIS, unit);
        mesh.material.opacity = !anyFocus ? 0.3 : active ? 0.5 : 0.1;
      }
    });

    if (n === 3) this.updateIntersections(rows);

    // Transformation picture: grid through the coefficient matrix, b as a dot.
    const m = new THREE.Matrix3();
    if (n === 2) m.set(rows[0][0], rows[0][1], 0, rows[1][0], rows[1][1], 0, 0, 0, 1);
    else m.set(rows[0][0], rows[0][1], rows[0][2], rows[1][0], rows[1][1], rows[1][2], rows[2][0], rows[2][1], rows[2][2]);
    this.transformed.matrix.setFromMatrix3(m);
    this.transformed.matrixWorldNeedsUpdate = true;
    const e = m.elements;
    for (let c = 0; c < n; c++) this.arrows[c].set(new THREE.Vector3(e[c * 3], e[c * 3 + 1], e[c * 3 + 2]));
    this.bDot.position.set(rows[0][n], rows[1][n], n === 3 ? rows[2][n] : 0);

    return m.determinant();
  }

  private updateIntersections(rows: number[][]): void {
    const planes = rows.map((r) => ({ n: new THREE.Vector3(r[0], r[1], r[2]), d: r[3] }));
    const pairs: [number, number][] = [[0, 1], [1, 2], [0, 2]];
    pairs.forEach(([a, b], k) => {
      const line = this.intersections[k];
      const { n: n1, d: d1 } = planes[a];
      const { n: n2, d: d2 } = planes[b];
      const u = new THREE.Vector3().crossVectors(n1, n2);
      const u2 = u.lengthSq();
      line.visible = u2 > EPS;
      if (!line.visible) return;
      // Point on both planes: (d1 (n2 × u) + d2 (u × n1)) / |u|²
      const p = new THREE.Vector3()
        .crossVectors(n2, u)
        .multiplyScalar(d1)
        .add(new THREE.Vector3().crossVectors(u, n1).multiplyScalar(d2))
        .divideScalar(u2);
      line.position.copy(p);
      line.quaternion.setFromUnitVectors(X_AXIS, u.normalize());
    });
  }

  dispose(): void {
    this.rowGroup.add(this.solutionDot);
    disposeChildren(this.reference);
    disposeChildren(this.rowGroup);
    disposeChildren(this.transformGroup);
  }
}
