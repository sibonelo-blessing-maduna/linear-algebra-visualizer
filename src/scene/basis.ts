import * as THREE from 'three';

export const BASIS_COLORS = [0x4ade80, 0xf87171, 0x60a5fa] as const;

/**
 * An arrow for a vector. Arrows are updated from the vector itself rather than
 * drawn through the matrix, so the arrowhead keeps its shape under shears and scalings.
 */
export class VectorArrow {
  readonly object: THREE.ArrowHelper;

  constructor(color: number, opacity = 1) {
    this.object = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, color);
    // Transparent even at full opacity: three.js draws transparent objects after opaque ones, so this puts
    // arrows in the same pass as the (semi-transparent) grids, where renderOrder can keep them on top.
    for (const m of [this.object.line.material, this.object.cone.material] as THREE.Material[]) {
      m.transparent = true;
      m.opacity = opacity;
    }
  }

  /** Points the arrow along v, starting at `origin` (default: the origin). */
  set(v: THREE.Vector3, origin?: THREE.Vector3): void {
    const length = v.length();
    this.object.visible = length > 1e-6;
    if (!this.object.visible) return;
    const head = Math.min(0.25, length * 0.4);
    this.object.position.copy(origin ?? new THREE.Vector3());
    this.object.setDirection(v.clone().divideScalar(length));
    this.object.setLength(length, head, head * 0.6);
  }
}
