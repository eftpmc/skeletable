export function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <section className="pt-4 md:pt-0">
      <h1 className="text-[30px] font-extrabold tracking-tight">{title}</h1>
      <div className="mt-6 flex min-h-[40vh] items-center justify-center rounded-3xl bg-surface px-6 text-center">
        <p className="max-w-xs text-sm text-muted">{body}</p>
      </div>
    </section>
  );
}
