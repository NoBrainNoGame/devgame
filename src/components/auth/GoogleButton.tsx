"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

/**
 * The way most people will sign in.
 *
 * It stays disabled after a successful call rather than flicking back to
 * enabled: the browser is already on its way to Google, and a button that
 * looks ready invites a second click that starts the flow again.
 */
export function GoogleButton({
  callbackUrl,
  className,
  size = "lg",
}: {
  callbackUrl: string;
  className?: string;
  size?: "default" | "lg" | "sm";
}) {
  const t = useTranslations("login");
  const errors = useTranslations("errors");
  const [pending, setPending] = useState(false);

  async function start(): Promise<void> {
    setPending(true);

    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: callbackUrl,
    });

    if (error) {
      setPending(false);
      toast.error(errors("unknown"));
    }
  }

  return (
    <Button
      type="button"
      size={size}
      disabled={pending}
      onClick={() => {
        void start();
      }}
      className={cn("w-full gap-3", className)}
    >
      <GoogleMark />
      {pending ? t("googlePending") : t("googleButton")}
    </Button>
  );
}

/**
 * Google's own mark, inline so it is one less request and cannot go missing.
 * The four brand colours are fixed by Google's guidelines and deliberately not
 * themed.
 */
function GoogleMark(): React.JSX.Element {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false" className="size-[1.1em]">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
