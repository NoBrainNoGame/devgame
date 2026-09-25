"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { GoogleButton } from "@/components/auth/GoogleButton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notify } from "@/components/ui/notify";
import type { ActionErrorCode } from "@/lib/actions/result";
import { authClient } from "@/lib/auth-client";

/**
 * Signing in.
 *
 * Google is the front door: one button, no typing, and the address it returns
 * is already verified. The magic link sits underneath, folded away, for people
 * who have no Google account or whose workplace blocks it — the point of
 * having two routes is that neither of them is a dead end.
 *
 * Both prove the same thing, so Better Auth links them onto one account; see
 * the note on `accountLinking` in `src/lib/auth.ts`.
 */
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
  const [showEmail, setShowEmail] = useState(!props.googleEnabled);

  async function requestLink(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);

    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: props.callbackUrl,
    });

    setPending(false);
    if (error) {
      notify.error(errors(codeFor(error.status)));
      return;
    }

    setSent(true);
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
    <div className="space-y-5">
      {props.googleEnabled ? (
        <GoogleButton callbackUrl={props.callbackUrl} />
      ) : (
        /* Hidden in production rather than shown broken: a button that cannot
           work is worse than no button. In development it says what is missing,
           because "why is there no Google button" is otherwise a long evening. */
        props.showDevHint && (
          <Alert className="border-debt/40">
            <AlertTitle className="text-debt">{t("googleUnavailable")}</AlertTitle>
            <AlertDescription>{t("googleUnavailableHint")}</AlertDescription>
          </Alert>
        )
      )}

      {showEmail ? (
        <div className="space-y-3">
          {props.googleEnabled ? <Separator label={t("orEmail")} /> : null}

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

            <Button type="submit" variant="outline" disabled={pending} className="w-full">
              {t("sendLink")}
            </Button>
          </form>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowEmail(true)}
          className="w-full text-center text-muted-foreground text-xs underline-offset-4 hover:text-foreground hover:underline"
        >
          {t("useEmailInstead")}
        </button>
      )}

      {props.showDevHint ? <p className="text-muted-foreground text-xs">{t("devHint")}</p> : null}
    </div>
  );
}

function Separator({ label }: { label: string }): React.JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-line" />
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

/** Better Auth reports an HTTP status; the UI speaks in `ActionResult` codes. */
function codeFor(status: number | undefined): ActionErrorCode {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 400 || status === 422) return "invalid";
  if (status === 429) return "rate-limited";
  return "internal";
}
