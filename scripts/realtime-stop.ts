import { stopRealtime } from "./lib/local";

/** `bun run realtime:stop`: ends the background realtime server, if one is running. */
stopRealtime()
  .then((stopped) => {
    console.log(stopped ? "Realtime server stopped." : "No realtime server was running.");
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
