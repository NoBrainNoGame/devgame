import { z } from "zod";

import { KNOWN_PATHS } from "@/lib/visits/paths";

/**
 * What a bug report may contain, decided before anything touches the
 * database. Every field is bounded; the text is kept as text and rendered
 * as text, so nothing typed is ever interpreted. Two fields exist for the
 * bots: a honeypot that must stay empty, and the time the form was opened,
 * which a person cannot beat in under a few seconds.
 */

export const REPORT_LIMITS = {
  title: { min: 3, max: 120 },
  body: { min: 10, max: 4000 },
  seed: 64,
  /** A form filled in less than this is not a person. */
  minFillMs: 3000,
  /** Reports one account may file in a day, whatever the rate limiter says. */
  perDay: 10,
} as const;

/** Drops control characters that have no business in a report, keeps line breaks. */
export function cleanText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

export const ReportInputSchema = z.object({
  title: z
    .string()
    .transform(cleanText)
    .pipe(z.string().min(REPORT_LIMITS.title.min).max(REPORT_LIMITS.title.max)),
  body: z
    .string()
    .transform(cleanText)
    .pipe(z.string().min(REPORT_LIMITS.body.min).max(REPORT_LIMITS.body.max)),
  page: z.enum(KNOWN_PATHS).optional(),
  seed: z
    .string()
    .trim()
    .max(REPORT_LIMITS.seed)
    .regex(/^[0-9a-zA-Z_-]*$/)
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
  /** The honeypot: a field no person sees, so a value in it is a bot. */
  website: z.string().max(0),
  /** When the form was opened, by the client's clock. */
  startedAt: z.number().int(),
});

export type ReportInput = z.infer<typeof ReportInputSchema>;

/** Whether the form was filled at a human pace. */
export function filledTooFast(input: Pick<ReportInput, "startedAt">, now: number): boolean {
  return now - input.startedAt < REPORT_LIMITS.minFillMs;
}
