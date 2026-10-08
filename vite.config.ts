import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works when served from GitHub Pages under /linear-algebra-visualizer/
  base: './',
  build: {
    // Three.js alone is ~600 kB minified; that's expected for this app.
    chunkSizeWarningLimit: 1000,
  },
});
