export default function Loading() {
  const bar = (w: string) => <div style={{ height: 14, width: w, background: 'var(--bd)', borderRadius: 4, marginBottom: 10 }} />;
  return (
    <div aria-busy="true" aria-label="Loading">
      <div style={{ height: 26, width: 180, background: 'var(--bd)', borderRadius: 4, marginBottom: 16 }} />
      <div className="c">{bar('60%')}{bar('90%')}{bar('75%')}{bar('85%')}</div>
    </div>
  );
}
