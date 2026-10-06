/** Static trend chart (demo data). Will be fed by the metrics table once SNS/ad APIs are connected. */
export function TrendChart({ kind = "reach" }: { kind?: "reach" | "ads" }) {
  const labels = ["9/09", "9/17", "9/25", "10/03"];
  const points =
    kind === "ads"
      ? "0,133 64,119 128,127 192,86 256,98 320,62 384,77 448,44 512,57 576,28"
      : "0,122 64,105 128,113 192,75 256,90 320,55 384,68 448,36 512,49 576,23";
  const area = `M${points.replaceAll(" ", " L")} L576 160 L0 160 Z`;
  return (
    <div className={`chart-wrap ${kind === "ads" ? "ad-chart" : ""}`}>
      <svg viewBox="0 0 610 180" preserveAspectRatio="none" role="img" aria-label="推移グラフ">
        <defs>
          <linearGradient id="areaGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#69a591" stopOpacity=".20" />
            <stop offset="100%" stopColor="#69a591" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[30, 75, 120, 160].map((y) => (
          <line key={y} className="chart-grid" x1="0" y1={y} x2="610" y2={y} />
        ))}
        <path className="chart-area" d={area} />
        <polyline className="chart-line" points={points} />
        {kind === "ads" && (
          <polyline className="chart-line secondary" points="0,144 64,138 128,122 192,132 256,109 320,117 384,104 448,91 512,104 576,83" />
        )}
        {labels.map((label, i) => (
          <text key={label} className="chart-label" x={[0, 192, 384, 560][i]} y="176">
            {label}
          </text>
        ))}
      </svg>
    </div>
  );
}
