import { loadEnv } from "./load-env.js";
import { runtimeConfigSchema } from "./schema.js";
import type { AppConfig } from "./types.js";

export function loadConfig(environment: NodeJS.ProcessEnv): AppConfig {
  const env = loadEnv(runtimeConfigSchema, environment);

  const config: AppConfig = {
    environment: env.NODE_ENV,
    databaseUrl: env.DATABASE_URL,
    http: Object.freeze({
      host: env.HTTP_HOST,
      port: env.HTTP_PORT,
    }),
    notion: Object.freeze({
      token: env.NOTION_TOKEN,
      contractVersion: env.NOTION_CONTRACT_VERSION,
      operatorUserIds: Object.freeze([...env.NOTION_OPERATOR_USER_IDS]),
    }),
    discord: Object.freeze({
      token: env.DISCORD_TOKEN,
      applicationId: env.DISCORD_APPLICATION_ID,
      guildId: env.DISCORD_GUILD_ID,
    }),
    capabilities: Object.freeze({ ...env.CAPABILITY_OWNERSHIP }),
    retentionDays: Object.freeze({
      inbox: env.RETENTION_INBOX_DAYS,
      audit: env.RETENTION_AUDIT_DAYS,
      operations: env.RETENTION_OPERATIONS_DAYS,
      documents: env.RETENTION_DOCUMENTS_DAYS,
    }),
  };

  return Object.freeze(config);
}
