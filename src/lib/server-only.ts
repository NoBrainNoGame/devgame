/**
 * Marker for modules that must never reach the browser bundle.
 *
 * We deliberately do not use the `server-only` npm package: it resolves via the
 * `react-server` export condition, so it throws in a plain Bun process — which
 * would break `prisma/seed.ts`, `scripts/ingest.ts`, and `bun test`. This guard
 * fires on the one thing that actually matters (the module ending up in a
 * client bundle) and stays silent in every server runtime.
 */
if (typeof window !== "undefined") {
  throw new Error(
    "A server-only module was imported into a Client Component. Move the import " +
      'behind a Server Component, a Server Action, or a route handler. (Look for the "use client" ' +
      "directive at the top of the importing file.)",
  );
}

export {};
