interface PlaceholderScreenProps {
  title: string;
  phase: string;
  description: string;
}

/** Stand-in for screens that arrive in a later phase. */
export function PlaceholderScreen({ title, phase, description }: PlaceholderScreenProps) {
  return (
    <>
      <header className="page-header">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="page-header__date">{phase}</span>
          <h1 className="page-title page-title--cjk">{title}</h1>
        </div>
      </header>
      <section className="card" style={{ alignItems: "center", textAlign: "center", padding: "48px 26px", border: "1px dashed var(--line-strong)", background: "transparent" }}>
        <span style={{ fontSize: 15, fontWeight: 500 }}>这个页面还在建设中</span>
        <span className="muted" style={{ fontSize: 13, maxWidth: 420 }}>
          {description}
        </span>
      </section>
    </>
  );
}
