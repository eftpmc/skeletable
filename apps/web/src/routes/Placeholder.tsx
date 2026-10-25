export function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="mt-6 flex min-h-[50vh] items-center justify-center rounded-3xl border border-dashed border-line">
        <p className="text-sm text-muted">{body}</p>
      </div>
    </section>
  );
}
