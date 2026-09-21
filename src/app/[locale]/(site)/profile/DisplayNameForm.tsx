"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { setDisplayName } from "@/lib/profile/actions";

/**
 * The one field a player owns. The action validates the length again on the
 * server — the `maxLength` here is a convenience, not the rule.
 */
export function DisplayNameForm({ initialName }: { initialName: string }): React.JSX.Element {
  const t = useTranslations("profile");
  const common = useTranslations("common");
  const errors = useTranslations("errors");
  const router = useRouter();

  const [name, setName] = useState(initialName);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    startTransition(async () => {
      const result = await setDisplayName(name);

      if (!result.ok) {
        toast.error(errors(result.error.code));
        return;
      }

      setName(result.data);
      // The name is server-rendered here and in the header.
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      <div className="min-w-0 flex-1 space-y-1.5">
        <Label htmlFor="displayName" className="text-muted-foreground text-xs">
          {t("displayName")}
        </Label>
        <Input
          id="displayName"
          name="displayName"
          value={name}
          minLength={2}
          maxLength={24}
          required
          disabled={pending}
          onChange={(event) => setName(event.target.value)}
          className="font-mono"
        />
      </div>
      <Button type="submit" variant="outline" disabled={pending || name === initialName}>
        {common("confirm")}
      </Button>
    </form>
  );
}
