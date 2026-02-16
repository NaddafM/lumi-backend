import { z } from "zod";

const AgeRangeSchema = z
  .string()
  .transform((raw, ctx) => {
    const value = raw.trim().toLowerCase();

    switch (true) {
      // Option 1: prefer not to say
      case value === "prefer not to say": {
        return { kind: "unspecified" as const };
      }

      // Option 2: 55+
      case /^\d{1,3}\+$/.test(value): {
        const min = Number(value.slice(0, -1));
        if (!Number.isInteger(min) || min < 0 || min > 120) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Invalid age value for '55+' format"
          });
          return z.NEVER;
        }
        return { kind: "plus" as const, min };
      }

      // Option 3: min-max
      case /^\d{1,3}-\d{1,3}$/.test(value): {
        const [minStr, maxStr] = value.split("-");
        const min = Number(minStr);
        const max = Number(maxStr);

        if (
          !Number.isInteger(min) ||
          !Number.isInteger(max) ||
          min < 0 ||
          max > 120 ||
          min > max
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Invalid age range values"
          });
          return z.NEVER;
        }

        return { kind: "range" as const, min, max };
      }

      default: {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "ageRange must be 'min-max', '55+', or 'prefer not to say'"
        });
        return z.NEVER;
      }
    }
  });

const VisitWithSchema = z.enum(["alone", "family", "friends", "date"]);
const CautiousnessSchema = z.enum(["relaxed", "balanced", "cautious"]);

export const QuestionPayloadSchema = z.object({
  requestId: z.string().min(1),
  userText: z.string().min(1).max(1000),

  context: z.object({
    ntaName: z.string().min(1).max(200).optional(),

    userLat: z.number().min(-90).max(90).optional(),
    userLng: z.number().min(-180).max(180).optional(),

    ageRange: AgeRangeSchema.optional(),
    gender: z.string().min(1).max(50).nullable().optional().transform(v => v ?? undefined),

    visitWith: VisitWithSchema.optional(),
    cautiousness: CautiousnessSchema.optional(),

    requestedPoiCount: z.number().int().min(1).max(20).optional(),

    // Optional, if you also send it from UI
    poiDescription: z.string().min(1).max(500).optional(),
    socioeconomicLevel: z.string().min(1).max(200).optional()
  }).optional(),

  clientTimestamp: z.number().int().optional()
});

export const CancelPayloadSchema = z.object({
  requestId: z.string().min(1)
});

export const EnvelopeSchema = z.object({
  event: z.string().min(1),
  data: z.unknown()
});

export type QuestionPayload = z.infer<typeof QuestionPayloadSchema>;
export type CancelPayload = z.infer<typeof CancelPayloadSchema>;
