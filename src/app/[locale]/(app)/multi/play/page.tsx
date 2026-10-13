import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { MultiStage } from "./MultiStage";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("multi");
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default function MultiPlayPage(): React.JSX.Element {
  return <MultiStage />;
}
