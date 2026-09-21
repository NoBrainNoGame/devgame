import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  /**
   * The production image is built from `.next/standalone` — see the Dockerfile
   * and docs/hosting.md. Removing this produces an image that boots and then
   * 404s on every asset.
   */
  output: "standalone",

  /**
   * Booyah ships ESM whose relative imports have no file extension and whose
   * package.json has no `"type": "module"`. Bundling it from source is the
   * cheapest way to make both bundlers agree on what it is.
   */
  transpilePackages: ["@ghom/booyah", "@ghom/utils", "@ghom/event-emitter"],
};

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
