"use client";

/**
 * Last-resort boundary for failures in the root layout itself.
 *
 * `error.tsx` sits inside the layout, so it cannot render when the layout is
 * what failed. This replaces the whole document and therefore has to supply its
 * own `<html>` and `<body>`.
 *
 * Deliberately dependency-free — no shared components, no Tailwind classes that
 * assume `globals.css` loaded, inline styles only. Anything imported here is
 * something that could itself be the reason this boundary was reached.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          margin: 0,
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
        }}
      >
        <main style={{ maxWidth: "32rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>
            Something went wrong
          </h1>
          <p style={{ color: "#57534e", marginTop: "0.75rem" }}>
            The site failed to load. Please try again.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              padding: "0.5rem 1rem",
              borderRadius: "0.375rem",
              border: "1px solid #d6d3d1",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p
              style={{
                color: "#78716c",
                marginTop: "1.5rem",
                fontSize: "0.75rem",
              }}
            >
              Reference:{" "}
              <span style={{ fontFamily: "monospace" }}>{error.digest}</span>
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
