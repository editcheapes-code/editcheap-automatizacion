import { z } from "zod";

const environmentNameSchema = z.enum(["development", "staging", "production"]);
const capabilityOwnerSchema = z.enum(["legacy", "replacement", "disabled"]);

const databaseUrlSchema = z.url().refine((value) => {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "postgres:" || protocol === "postgresql:";
  } catch {
    return false;
  }
});

const portSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(65_535));

const retentionDaysSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(3_650));

const operatorUserIdsSchema = z
  .string()
  .transform((value) => value.split(",").map((userId) => userId.trim()))
  .pipe(z.array(z.string().min(1).max(255)).min(1))
  .refine(
    (userIds) => new Set(userIds).size === userIds.length,
    "operator user ids must be unique",
  );

const capabilityOwnershipSchema = z.string().transform((value, context) => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    context.addIssue({
      code: "custom",
      message: "invalid capability ownership map",
    });
    return z.NEVER;
  }

  const result = z
    .record(z.string().min(1), capabilityOwnerSchema)
    .safeParse(parsed);

  if (!result.success || Object.keys(result.data).length === 0) {
    context.addIssue({
      code: "custom",
      message: "invalid capability ownership map",
    });
    return z.NEVER;
  }

  return result.data;
});

export const runtimeConfigSchema = z
  .object({
    NODE_ENV: environmentNameSchema,
    DATABASE_URL: databaseUrlSchema,
    DATABASE_ENVIRONMENT: environmentNameSchema,
    HTTP_HOST: z.string().min(1).max(255),
    HTTP_PORT: portSchema,
    NOTION_TOKEN: z.string().min(1),
    NOTION_ENVIRONMENT: environmentNameSchema,
    NOTION_CONTRACT_VERSION: z.string().min(1).max(255),
    NOTION_OPERATOR_USER_IDS: operatorUserIdsSchema,
    DISCORD_TOKEN: z.string().min(1),
    DISCORD_ENVIRONMENT: environmentNameSchema,
    DISCORD_APPLICATION_ID: z.string().min(1).max(255),
    DISCORD_GUILD_ID: z.string().min(1).max(255),
    CAPABILITY_OWNERSHIP: capabilityOwnershipSchema,
    RETENTION_INBOX_DAYS: retentionDaysSchema,
    RETENTION_AUDIT_DAYS: retentionDaysSchema,
    RETENTION_OPERATIONS_DAYS: retentionDaysSchema,
    RETENTION_DOCUMENTS_DAYS: retentionDaysSchema,
  })
  .superRefine((config, context) => {
    const provenance = [
      "DATABASE_ENVIRONMENT",
      "NOTION_ENVIRONMENT",
      "DISCORD_ENVIRONMENT",
    ] as const;

    for (const field of provenance) {
      if (config[field] !== config.NODE_ENV) {
        context.addIssue({
          code: "custom",
          message: "resource environment must match NODE_ENV",
          path: [field],
        });
      }
    }
  });
