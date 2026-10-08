# Linear Algebra Visualizer

An interactive tool that shows what linear algebra operations *do* geometrically — in 2D and 3D — by animating space as it is transformed.

Built with [Three.js](https://threejs.org/), TypeScript and [Vite](https://vite.dev/).

## Getting started

```bash
npm install
npm run dev      # start the dev server at http://localhost:5173
npm test         # run unit tests
npm run build    # typecheck and build to dist/
```

## Sections

### Transformations

- Edit a 2×2 or 3×3 matrix and watch the grid morph from the identity to it.
- Basis vectors **î, ĵ, k̂** are drawn as arrows — the columns of the matrix are exactly where they land.
- The unit square / cube shows the **determinant** as an area / volume scale (and orientation flip when det < 0).

### Gaussian Elimination

A step-through interpreter on the left, the geometry on the right, in sync:

- Pseudocode for Gauss–Jordan elimination with the current line highlighted, live variables (`r`, `c`, `p`, `i`, `m`) and the arithmetic for each row operation, using exact fractions.
- The augmented matrix [A | b] with the pivot, active rows and changed entries highlighted.
- **Row picture:** each equation is a line (2D) or plane (3D). Row replacements swing a line/plane around the solution, which never moves; swaps and scalings leave the geometry untouched.
- **Transformation picture:** A as a grid transformation. Replacements are shears (det unchanged), swaps are reflections (det flips sign), scalings scale det. The dot for b lands on x once A has become I.
- Examples for unique, row-swap, infinitely-many and no-solution systems, or enter your own (integers, fractions like `-3/2`, or decimals).
- Keyboard: <kbd>Space</kbd> play/pause, <kbd>←</kbd>/<kbd>→</kbd> step, <kbd>Home</kbd>/<kbd>End</kbd> jump.

## Project structure

```
src/
  main.ts                        navigation between sections
  core/viewport.ts               Three.js canvas with 2D/3D cameras and controls
  math/matrix.ts                 matrix helpers (interpolation, conversions, easing)
  math/fraction.ts               exact rational arithmetic
  scene/grid.ts                  lattice grid, unit square/cube, axes
  scene/basis.ts                 vector arrows
  modes/transformations.ts       Transformations section
  modes/elimination/algorithm.ts elimination tracer (one step per pseudocode line)
  modes/elimination/geometry.ts  row picture and transformation picture
  modes/elimination/index.ts     Gaussian Elimination section UI and playback
```
