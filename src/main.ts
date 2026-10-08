import './style.css';
import { mountTransformations } from './modes/transformations';
import { mountElimination } from './modes/elimination';

/** Each section mounts into the page and returns a function that tears it down. */
const SECTIONS: Record<string, { title: string; mount: (root: HTMLElement) => () => void }> = {
  transformations: { title: 'Transformations', mount: mountTransformations },
  elimination: { title: 'Gaussian Elimination', mount: mountElimination },
};
const DEFAULT_SECTION = 'transformations';

const nav = document.getElementById('nav')!;
const view = document.getElementById('view')!;

nav.innerHTML = Object.entries(SECTIONS)
  .map(([key, s]) => `<a href="#/${key}" data-section="${key}">${s.title}</a>`)
  .join('');

let unmount: (() => void) | null = null;

function route(): void {
  const key = location.hash.replace(/^#\/?/, '');
  const name = key in SECTIONS ? key : DEFAULT_SECTION;
  unmount?.();
  unmount = SECTIONS[name].mount(view);
  nav.querySelectorAll<HTMLElement>('a').forEach((a) => a.classList.toggle('on', a.dataset.section === name));
  document.title = `${SECTIONS[name].title} · Linear Algebra Visualizer`;
}

window.addEventListener('hashchange', route);
route();
