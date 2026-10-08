import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Dimension } from '../scene/grid';

/**
 * A Three.js canvas that fills its container, with a flat orthographic camera for 2D
 * and an orbiting perspective camera for 3D. Sections add objects to `scene` and
 * per-frame work via `onFrame`.
 */
export class Viewport {
  readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  readonly scene = new THREE.Scene();
  dim: Dimension = 2;

  private readonly orthoCamera = new THREE.OrthographicCamera();
  private readonly perspCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  private readonly orthoControls: OrbitControls;
  private readonly perspControls: OrbitControls;
  private readonly frameCallbacks = new Set<(now: number) => void>();
  private readonly resizeObserver: ResizeObserver;
  private rafId = 0;

  constructor(
    private readonly container: HTMLElement,
    private readonly halfHeight2D = 6,
    cameraPosition3D: [number, number, number] = [6, 5, 8],
  ) {
    const r = this.renderer;
    r.setPixelRatio(window.devicePixelRatio);
    r.setClearColor(0x0f1117);
    r.localClippingEnabled = true;
    container.appendChild(r.domElement);

    this.orthoCamera.position.set(0, 0, 10);
    this.perspCamera.position.set(...cameraPosition3D);

    this.orthoControls = new OrbitControls(this.orthoCamera, r.domElement);
    this.orthoControls.enableRotate = false;
    this.orthoControls.screenSpacePanning = true;

    this.perspControls = new OrbitControls(this.perspCamera, r.domElement);
    this.perspControls.enableDamping = true;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.setDimension(2);

    const loop = (now: number) => {
      this.frameCallbacks.forEach((cb) => cb(now));
      this.controls.update();
      r.render(this.scene, this.camera);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  get camera(): THREE.Camera {
    return this.dim === 2 ? this.orthoCamera : this.perspCamera;
  }

  private get controls(): OrbitControls {
    return this.dim === 2 ? this.orthoControls : this.perspControls;
  }

  setDimension(d: Dimension): void {
    this.dim = d;
    this.orthoControls.enabled = d === 2;
    this.perspControls.enabled = d === 3;
  }

  /** Registers a per-frame callback; returns a function that unregisters it. */
  onFrame(cb: (now: number) => void): () => void {
    this.frameCallbacks.add(cb);
    return () => this.frameCallbacks.delete(cb);
  }

  private resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    const aspect = w / h;
    const s = this.halfHeight2D;
    Object.assign(this.orthoCamera, { left: -s * aspect, right: s * aspect, top: s, bottom: -s });
    this.orthoCamera.updateProjectionMatrix();
    this.perspCamera.aspect = aspect;
    this.perspCamera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.resizeObserver.disconnect();
    this.orthoControls.dispose();
    this.perspControls.dispose();
    disposeChildren(this.scene);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

/** Frees GPU resources of everything under `group` and removes it from the group. */
export function disposeChildren(group: THREE.Object3D): void {
  group.traverse((o) => {
    const obj = o as Partial<THREE.Mesh>;
    obj.geometry?.dispose();
    const mats = obj.material ? ([] as THREE.Material[]).concat(obj.material) : [];
    for (const m of mats) {
      (m as THREE.MeshBasicMaterial).map?.dispose();
      m.dispose();
    }
  });
  group.clear();
}
