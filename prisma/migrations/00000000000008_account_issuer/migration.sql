-- Better Auth 1.7 keys an account by (issuer, accountId) rather than by
-- (providerId, accountId). Existing rows get the issuer Better Auth itself
-- would compute: Google's own, "local:credential" for passwords, and
-- "local:oauth:<provider>" for any other OAuth provider.
ALTER TABLE "account" ADD COLUMN "issuer" TEXT;

UPDATE "account" SET "issuer" = CASE
  WHEN "providerId" = 'google' THEN 'https://accounts.google.com'
  WHEN "providerId" = 'credential' THEN 'local:credential'
  ELSE 'local:oauth:' || "providerId"
END;

ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL;

CREATE UNIQUE INDEX "account_issuer_accountId_key" ON "account"("issuer", "accountId");
