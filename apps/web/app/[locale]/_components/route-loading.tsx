// Route-level loading fallback shared by the authed segments' loading.tsx files.
// Deliberately text-free: loading.tsx can't read the locale (no props), so a
// visual pulse + aria-label beats hardcoding one language.
export function RouteLoading() {
  return (
    <div
      role="status"
      aria-label="Loading"
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        background: "var(--bg)",
      }}
    >
      <span className="route-loading-dot" aria-hidden />
    </div>
  );
}
