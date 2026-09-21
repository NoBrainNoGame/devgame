"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionErrorCode } from "@/lib/actions/result";
import { authClient } from "@/lib/auth-client";

export interface LoginFormProps {
  /** Where Better Auth sends the player once the link is followed. */
  callbackUrl: string;
  googleEnabled: boolean;
  showDevHint: boolean;
}

export function LoginForm(props: LoginFormProps): React.JSX.Element {
  const t = useTranslations("login");
  const errors = useTranslations("errors");

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function requestLink(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);

    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: props.callbackUrl,
    });

    setPending(false);
    if (error) {
      toast.error(errors(codeFor(error.status)));
      return;
    }

    setSent(true);
  }

  async function signInWithGoogle(): Promise<void> {
    setPending(true);

    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: props.callbackUrl,
    });

    // On success the browser is already on its way to Google, so the button
    // stays disabled rather than flickering back to enabled.
    if (error) {
      setPending(false);
      toast.error(errors(codeFor(error.status)));
    }
  }

  if (sent) {
    return (
      <Alert className="border-branch-main/40">
        <AlertTitle className="text-branch-main">{t("linkSent")}</AlertTitle>
        <AlertDescription>{t("linkSentHint")}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={(event) => {
          void requestLink(event);
        }}
        className="space-y-3"
      >
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-muted-foreground text-xs">
            {t("emailLabel")}
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            disabled={pending}
            placeholder={t("emailPlaceholder")}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="font-mono"
          />
        </div>

        <Button type="submit" disabled={pending} className="w-full">
          {t("sendLink")}
        </Button>
      </form>

      {props.googleEnabled ? (
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          className="w-full"
          onClick={() => {
            void signInWithGoogle();
          }}
        >
          {t("googleButton")}
        </Button>
      ) : null}

      {props.showDevHint ? <p className="text-muted-foreground text-xs">{t("devHint")}</p> : null}
    </div>
  );
}

/**
 * Better Auth answers with an HTTP status; the UI speaks the same vocabulary of
 * error codes everywhere else, so translate once, here.
 */
function codeFor(status: number | undefined): ActionErrorCode {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 400 || status === 422) return "invalid";
  if (status === 429) return "rate-limited";
  return "internal";
}
