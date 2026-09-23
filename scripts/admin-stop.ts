import { stopAdmin } from "./lib/local";

/** `bun run admin:stop`: ends the background admin panel, if one is running. */
stopAdmin()
  .then((stopped) => {
    console.log(stopped ? "Admin panel stopped." : "No admin panel was running.");
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
