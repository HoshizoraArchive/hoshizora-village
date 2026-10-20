// Shared reusable section container.
export function Panel({ eyebrow, title, children }) {
  return (
    <section className="glass-panel p-4">
      <p className="text-xs font-bold uppercase text-comet">{eyebrow}</p>
      <h2 className="mt-1 text-lg font-black text-white">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
