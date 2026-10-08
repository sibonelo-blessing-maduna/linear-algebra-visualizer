import * as THREE from 'three';

export const BASIS_COLORS = [0x4ade80, 0xf87171, 0x60a5fa] as const;

/**
 * An arrow from the origin to a vector. Arrows are updated from the vector itself rather than
 * drawn through the matrix, so the arrowhead keeps its shape under shears and scalings.
 */
export class VectorArrow {
  readonly object: THREE.ArrowHelper;

  constructor(color: number) {
    this.object = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, color);
  }

  set(v: THREE.Vector3): void {
    const length = v.length();
    this.object.visible = length > 1e-6;
    if (!this.object.visible) return;
    const head = Math.min(0.25, length * 0.4);
    this.object.setDirection(v.clone().divideScalar(length));
    this.object.setLength(length, head, head * 0.6);
  }
}
