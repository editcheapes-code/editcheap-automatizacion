import type { z } from "zod";
import { runtimeConfigSchema } from "./schema.js";
import type { AppConfig } from "./types.js";

function formatValidationError(error: z.ZodError): string {
  const fields = [
    ...new Set(
      error.issues.map((issue) =>
        issue.path.length === 0 ? "configuration" : issue.path.join("."),
      ),
    ),
  ];

  return `invalid runtime configuration: ${fields.join(", ")}`;
}

export function loadConfig(environment: NodeJS.ProcessEnv): AppConfig {
  const result = runtimeConfigSchema.safeParse(environment);

  if (!result.success) {
    throw new Error(formatValidationError(result.error));
  }

  const config: AppConfig = {
    environment: result.data.NODE_ENV,
    databaseUrl: result.data.DATABASE_URL,
    http: Object.freeze({
      host: result.data.HTTP_HOST,
      port: result.data.HTTP_PORT,
    }),
    notion: Object.freeze({
      token: result.data.NOTION_TOKEN,
      contractVersion: result.data.NOTION_CONTRACT_VERSION,
      operatorUserIds: Object.freeze([...result.data.NOTION_OPERATOR_USER_IDS]),
    }),
    discord: Object.freeze({
      token: result.data.DISCORD_TOKEN,
      applicationId: result.data.DISCORD_APPLICATION_ID,
      guildId: result.data.DISCORD_GUILD_ID,
    }),
    capabilities: Object.freeze({ ...result.data.CAPABILITY_OWNERSHIP }),
    retentionDays: Object.freeze({
      inbox: result.data.RETENTION_INBOX_DAYS,
      audit: result.data.RETENTION_AUDIT_DAYS,
      operations: result.data.RETENTION_OPERATIONS_DAYS,
      documents: result.data.RETENTION_DOCUMENTS_DAYS,
    }),
  };

  return Object.freeze(config);
}
