// Decorative topographic contour lines (every 4th line is an "index contour", drawn heavier).
function ring(cx: number, cy: number, base: number, seed: number) {
  const pts: string[] = [];
  for (let a = 0; a <= 360; a += 6) {
    const t = (a * Math.PI) / 180;
    const r = base * (1 + 0.09 * Math.sin(2 * t + seed) + 0.06 * Math.sin(3 * t + seed * 1.7) + 0.03 * Math.sin(5 * t + seed * 2.3));
    pts.push(`${(cx + r * Math.cos(t)).toFixed(1)},${(cy + r * Math.sin(t) * 0.82).toFixed(1)}`);
  }
  return "M" + pts.join("L") + "Z";
}

export function Contours({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 600 600" preserveAspectRatio="xMidYMid slice" className={className} fill="none" aria-hidden="true">
      {Array.from({ length: 13 }, (_, i) => (
        <path key={i} d={ring(380, 300, 36 + i * 27, i * 0.35)} stroke="currentColor" strokeWidth={i % 4 === 0 ? 1.8 : 0.9} />
      ))}
    </svg>
  );
}
