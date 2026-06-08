interface StatusStripProps {
  tone?: "default" | "success";
  title?: string;
  message: string;
}

export function StatusStrip({ tone = "default", title, message }: StatusStripProps) {
  return (
    <section className={tone === "success" ? "dashboard-banner dashboard-banner--success" : "dashboard-banner"}>
      {title ? <strong>{title}</strong> : null}
      <p>{message}</p>
    </section>
  );
}
