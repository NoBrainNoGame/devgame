import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

/** One line. The concept, and a way back to it. */
export async function Footer(): Promise<React.JSX.Element> {
  const [common, landing] = await Promise.all([
    getTranslations("common"),
    getTranslations("landing"),
  ]);

  return (
    <footer className="shrink-0 border-line border-t px-3 py-3 text-muted-foreground text-xs sm:px-4">
      <p>
        <Link href="/" className="text-foreground transition-colors hover:text-branch-main">
          {common("appName")}
        </Link>
        {" — "}
        {landing("tagline")}
      </p>
    </footer>
  );
}
