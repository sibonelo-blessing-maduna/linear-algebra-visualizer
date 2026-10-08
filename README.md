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

Both sections share the same layout: a step-through interpreter on the left (pseudocode with the current line highlighted, live variables, and the arithmetic in exact fractions) and the geometry on the right, animated in sync. Keyboard: <kbd>Space</kbd> play/pause, <kbd>←</kbd>/<kbd>→</kbd> step, <kbd>Home</kbd>/<kbd>End</kbd> jump.

### Transformations

Step through applying a 2×2 or 3×3 matrix A to a vector v:

- **Coordinates as a recipe:** v = x·î + y·ĵ, drawn head to tail.
- **Moving the basis:** each basis vector moves to its column of A, dragging the grid with it, and v rides along because it is glued to the grid.
- **Column picture:** the same recipe along the moved basis lands on Av.
- **Row picture:** each coordinate of Av is a row of A times v, shown with a guide to the axis.
- **Determinant:** the image of the unit square/cube, with its area/volume computed by cofactor expansion.

### Matrix Multiplication

Step through AB as "first B, then A":

- **One after another:** the grid moves by B, then A moves the already-moved grid; faint arrows keep where B left the basis vectors.
- **Column picture:** column j of AB is A times column j of B, walked head to tail along A's columns.
- **Row × column:** each entry is a row of A times a column of B, read off with a guide to the axis.
- **Determinant:** the unit square/cube after B (outlined) and after AB (filled): det(AB) = det A · det B.
- **Order matters:** paired examples like "Rotate, then shear" / "Shear, then rotate", and the result step compares AB with BA.

### Gaussian Elimination

- Gauss–Jordan elimination on [A | b], with the pivot, active rows and changed entries highlighted.
- **Row picture:** each equation is a line (2D) or plane (3D). Row replacements swing a line/plane around the solution, which never moves; swaps and scalings leave the geometry untouched.
- **Transformation picture:** A as a grid transformation. Replacements are shears (det unchanged), swaps are reflections (det flips sign), scalings scale det. The dot for b lands on x once A has become I.
- Examples for unique, row-swap, infinitely-many and no-solution systems.

Both sections take your own input via **Custom…** (integers, fractions like `-3/2`, or decimals).

## Project structure

```
src/
  main.ts                            navigation between sections
  core/viewport.ts                   Three.js canvas with 2D/3D cameras and controls
  core/stepper.ts                    shared interpreter layout: editor, playback, code, narration
  math/fraction.ts                   exact rational arithmetic
  math/notation.ts                   shared types and variable names
  scene/grid.ts                      lattice grid, unit square/cube, axes, labels
  scene/basis.ts                     vector arrows
  modes/transformations/algorithm.ts tracer for "apply A to v"
  modes/transformations/geometry.ts  moving grid, basis, v / Av, guides
  modes/transformations/index.ts     Transformations section
  modes/multiplication/              Matrix Multiplication section (tracer, geometry, UI)
  modes/elimination/algorithm.ts     elimination tracer (one step per pseudocode line)
  modes/elimination/geometry.ts      row picture and transformation picture
  modes/elimination/index.ts         Gaussian Elimination section
```
