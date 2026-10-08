import { Matrix3, Matrix4 } from 'three';

/** Row-major 3x3 entries, the way matrices are written on paper. */
export type Rows3 = [
  [number, number, number],
  [number, number, number],
  [number, number, number],
];

export function identityRows(): Rows3 {
  return [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
}

export function rowsToMatrix3(r: Rows3): Matrix3 {
  return new Matrix3().set(...r[0], ...r[1], ...r[2]);
}

/** Entry-wise interpolation (1 - t)·A + t·B — the "straight-line" morph between two matrices. */
export function lerpMatrix3(a: Matrix3, b: Matrix3, t: number, out = new Matrix3()): Matrix3 {
  for (let i = 0; i < 9; i++) {
    out.elements[i] = a.elements[i] + (b.elements[i] - a.elements[i]) * t;
  }
  return out;
}

/** Embed a linear 3x3 map in a 4x4 transform so Three.js objects can be drawn through it. */
export function toMatrix4(m: Matrix3, out = new Matrix4()): Matrix4 {
  return out.setFromMatrix3(m);
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
