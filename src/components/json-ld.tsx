/**
 * Structured data, written into the HTML the server delivers.
 *
 * `<` is escaped because the payload carries catalogue text: a product name
 * containing `</script>` would otherwise close the element and run whatever
 * followed. This is the one sanctioned `dangerouslySetInnerHTML` in the
 * project, and only for a serialised object — never for backend prose.
 *
 * A native `<script>`, not `next/script`: this is data, not code to execute.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
