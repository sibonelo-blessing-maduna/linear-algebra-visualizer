import { esc } from '../../core/stepper';
import { evalPoly, fmtNum } from './math';
import { EIGEN_CSS } from './geometry';

const W = 460;
const H = 130;
const M = { l: 12, r: 12, t: 18, b: 24 };

export interface PolyChart {
  /** Moves the "current λ" marker (null hides it). */
  setMarker(lambda: number | null): void;
}

/**
 * A small plot of p(λ) = det(A − λI): one line, the real roots marked in their eigen colours
 * and labelled directly, a marker for the λ being looked at, and a hover readout.
 */
export function renderPolyChart(
  host: HTMLElement,
  coeffs: number[],
  roots: { value: number; label: string }[],
  [lo, hi]: [number, number],
): PolyChart {
  const N = 160;
  const xs = Array.from({ length: N + 1 }, (_, i) => lo + ((hi - lo) * i) / N);
  const ys = xs.map((x) => evalPoly(coeffs, x));
  const yMax = Math.max(1, ...ys.map(Math.abs)) * 1.1;
  const sx = (x: number) => M.l + ((x - lo) / (hi - lo)) * (W - M.l - M.r);
  const sy = (y: number) => M.t + ((yMax - y) / (2 * yMax)) * (H - M.t - M.b);
  const zero = sy(0);

  const path = xs.map((x, i) => `${i ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(ys[i]).toFixed(1)}`).join('');
  const step = Math.max(1, Math.ceil((hi - lo) / 8));
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);

  const rootMarks = roots
    .map(
      (r, k) => `
      <circle cx="${sx(r.value)}" cy="${zero}" r="4.5" fill="${EIGEN_CSS[k]}" stroke="var(--card)" stroke-width="2"/>
      <text x="${sx(r.value)}" y="${zero - 9}" class="chart-label" text-anchor="middle">λ${roots.length > 1 ? '₁₂₃'[k] : ''} = ${esc(r.label.replace(/^.*≈ /, '≈'))}</text>`,
    )
    .join('');

  host.innerHTML = `
    <div class="poly-chart">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Plot of the characteristic polynomial p(λ); its zeros are the eigenvalues">
        <line x1="${M.l}" x2="${W - M.r}" y1="${zero}" y2="${zero}" class="chart-axis"/>
        ${ticks
          .map((t) => `<line x1="${sx(t)}" x2="${sx(t)}" y1="${zero - 3}" y2="${zero + 3}" class="chart-axis"/><text x="${sx(t)}" y="${H - 6}" class="chart-tick" text-anchor="middle">${fmtNum(t)}</text>`)
          .join('')}
        <text x="${W - M.r}" y="${H - 6}" class="chart-tick" text-anchor="end" dx="0">λ</text>
        <path d="${path}" class="chart-line"/>
        ${rootMarks}
        <g class="chart-marker" hidden>
          <line y1="${M.t}" y2="${H - M.b}" class="chart-marker-line"/>
          <circle r="4" class="chart-marker-dot"/>
        </g>
        <line class="chart-cross" y1="${M.t}" y2="${H - M.b}" hidden/>
        <rect x="${M.l}" y="0" width="${W - M.l - M.r}" height="${H}" fill="transparent" class="chart-hit"/>
      </svg>
      <div class="chart-tip" hidden></div>
    </div>`;

  const svg = host.querySelector('svg')!;
  const marker = svg.querySelector<SVGGElement>('.chart-marker')!;
  const cross = svg.querySelector<SVGLineElement>('.chart-cross')!;
  const tip = host.querySelector<HTMLElement>('.chart-tip')!;

  // Hover: crosshair + readout of λ and p(λ).
  const hit = svg.querySelector('.chart-hit')!;
  hit.addEventListener('pointermove', (e) => {
    const box = svg.getBoundingClientRect();
    const px = (((e as PointerEvent).clientX - box.left) / box.width) * W;
    const x = lo + ((px - M.l) / (W - M.l - M.r)) * (hi - lo);
    cross.setAttribute('x1', String(px));
    cross.setAttribute('x2', String(px));
    cross.removeAttribute('hidden');
    tip.hidden = false;
    tip.textContent = `λ = ${fmtNum(x)}   p(λ) = ${fmtNum(evalPoly(coeffs, x))}`;
    tip.style.left = `${Math.min(Math.max((px / W) * 100, 15), 85)}%`;
  });
  hit.addEventListener('pointerleave', () => {
    cross.setAttribute('hidden', '');
    tip.hidden = true;
  });

  return {
    setMarker(lambda) {
      if (lambda === null || lambda < lo || lambda > hi) {
        marker.setAttribute('hidden', '');
        return;
      }
      marker.removeAttribute('hidden');
      const x = sx(lambda);
      const line = marker.querySelector('line')!;
      line.setAttribute('x1', String(x));
      line.setAttribute('x2', String(x));
      const dot = marker.querySelector('circle')!;
      dot.setAttribute('cx', String(x));
      dot.setAttribute('cy', String(Math.min(Math.max(sy(evalPoly(coeffs, lambda)), M.t), H - M.b)));
    },
  };
}
