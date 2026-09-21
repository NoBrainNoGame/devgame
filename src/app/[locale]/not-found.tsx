import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

export default async function NotFound(): Promise<React.JSX.Element> {
  const nav = await getTranslations("nav");

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-start gap-4 px-4 py-16">
      <p className="font-semibold text-4xl text-branch-hotfix tabular-nums">404</p>
      {/* Git prints its own errors in English whatever your locale is, so this
          line is not a message key. */}
      <p className="text-muted-foreground text-sm">
        fatal: pathspec did not match any file known to git
      </p>
      <Link
        href="/"
        className="text-branch-main text-sm underline-offset-4 transition-colors hover:underline"
      >
        {nav("home")}
      </Link>
    </div>
  );
}
