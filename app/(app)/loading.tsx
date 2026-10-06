export default function Loading() {
  return (
    <div aria-busy="true" aria-label="読み込み中">
      <div className="page-heading">
        <div style={{ width: "40%" }}>
          <div className="skeleton" style={{ height: 10, width: 90, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 22, width: "80%", marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 10, width: "60%" }} />
        </div>
      </div>
      <section className="metric-grid">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="metric-card">
            <div className="skeleton" style={{ height: 10, width: "50%" }} />
            <div className="skeleton" style={{ height: 22, width: "40%", margin: "14px 0 8px" }} />
            <div className="skeleton" style={{ height: 8, width: "30%" }} />
          </div>
        ))}
      </section>
      <div className="panel section-spacer">
        <div className="skeleton" style={{ height: 160 }} />
      </div>
    </div>
  );
}
