// The real `server-only` package throws on import outside a React Server
// Component graph, which is exactly its purpose. Vitest runs plain Node, so it
// is aliased to this empty module (see vitest.config.ts).
export {};
