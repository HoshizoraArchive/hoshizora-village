// Static cosmic background layers.
export function SkyBackdrop() {
  return (
    <div className="cosmic-background pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div className="cosmic-haze" />
      <div className="moon" />
      <div className="stars-layer" />
      <div className="distant-stars" />
      <div className="shooting-star shooting-star-a" />
      <div className="shooting-star shooting-star-b" />
      <div className="distant-village">
        <span className="village-window village-window-a" />
        <span className="village-window village-window-b" />
        <span className="village-window village-window-c" />
        <span className="village-window village-window-d" />
        <span className="village-window village-window-e" />
      </div>
    </div>
  );
}

export function StardustForeground() {
  return <div className="foreground-stardust pointer-events-none fixed inset-0 z-30" aria-hidden="true" />;
}
