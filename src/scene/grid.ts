import * as THREE from 'three';

export type Dimension = 2 | 3;

/**
 * Integer lattice lines. In 2D: lines x = c and y = c on the xy-plane.
 * In 3D: lines parallel to each axis through every integer point of a cube.
 * Linear maps send lines to lines, so each line only needs its two endpoints.
 */
export function createGrid(dim: Dimension, extent: number, color: number, opacity: number): THREE.LineSegments {
  const pts: number[] = [];
  const n = extent;

  if (dim === 2) {
    for (let c = -n; c <= n; c++) {
      pts.push(c, -n, 0, c, n, 0);
      pts.push(-n, c, 0, n, c, 0);
    }
  } else {
    for (let a = -n; a <= n; a++) {
      for (let b = -n; b <= n; b++) {
        pts.push(-n, a, b, n, a, b);
        pts.push(a, -n, b, a, n, b);
        pts.push(a, b, -n, a, b, n);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const material = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
  return new THREE.LineSegments(geometry, material);
}

/** Unit square (2D) or unit cube (3D); its transformed area/volume is |det A|. */
export function createUnitShape(dim: Dimension): THREE.Object3D {
  const group = new THREE.Group();
  const color = 0xfacc15;

  const geometry =
    dim === 2
      ? new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0)
      : new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5);

  group.add(
    new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }),
    ),
    new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color })),
  );
  return group;
}

/** A small text sprite that always faces the camera. */
export function createLabel(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.font = 'italic 600 44px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 32, 34);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.setScalar(0.45);
  return sprite;
}

/** Full coordinate axes through the origin, with x / y (/ z) labels at `labelAt` on the positive side. */
export function createAxes(dim: Dimension, length: number, labelAt: number): THREE.Group {
  const pts = [-length, 0, 0, length, 0, 0, 0, -length, 0, 0, length, 0];
  if (dim === 3) pts.push(0, 0, -length, 0, 0, length);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x64748b }));
  lines.position.z = dim === 2 ? 0.002 : 0; // draw over the 2D grid

  const group = new THREE.Group();
  group.add(lines);
  const names = dim === 2 ? ['x', 'y'] : ['x', 'y', 'z'];
  names.forEach((name, k) => {
    const label = createLabel(name, '#94a3b8');
    const offset = dim === 2 ? 0.3 : 0;
    label.position.set(k === 0 ? labelAt : offset, k === 1 ? labelAt : k === 0 ? offset : 0, k === 2 ? labelAt : 0);
    group.add(label);
  });
  return group;
}
