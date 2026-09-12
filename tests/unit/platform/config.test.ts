import { describe, expect, it } from "vitest";
import { loadConfig } from "../../../src/platform/config/load-config.js";

const developmentEnvironment = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://localhost:5432/editcheap_development",
  DATABASE_ENVIRONMENT: "development",
  HTTP_HOST: "127.0.0.1",
  HTTP_PORT: "3100",
  NOTION_TOKEN: "notion-development-token",
  NOTION_ENVIRONMENT: "development",
  NOTION_CONTRACT_VERSION: "v1",
  NOTION_OPERATOR_USER_IDS: "notion-operator-1,notion-operator-2",
  DISCORD_TOKEN: "discord-development-token",
  DISCORD_ENVIRONMENT: "development",
  DISCORD_APPLICATION_ID: "discord-development-application",
  DISCORD_GUILD_ID: "discord-development-guild",
  CAPABILITY_OWNERSHIP: '{"orders":"replacement","documents":"disabled"}',
  RETENTION_INBOX_DAYS: "30",
  RETENTION_AUDIT_DAYS: "365",
  RETENTION_OPERATIONS_DAYS: "90",
  RETENTION_DOCUMENTS_DAYS: "180",
} satisfies NodeJS.ProcessEnv;

describe("loadConfig", () => {
  it("loads an immutable development configuration", () => {
    const config = loadConfig(developmentEnvironment);

    expect(config).toEqual({
      environment: "development",
      databaseUrl: "postgresql://localhost:5432/editcheap_development",
      http: { host: "127.0.0.1", port: 3100 },
      notion: {
        token: "notion-development-token",
        contractVersion: "v1",
        operatorUserIds: ["notion-operator-1", "notion-operator-2"],
      },
      discord: {
        token: "discord-development-token",
        applicationId: "discord-development-application",
        guildId: "discord-development-guild",
      },
      capabilities: { orders: "replacement", documents: "disabled" },
      retentionDays: { inbox: 30, audit: 365, operations: 90, documents: 180 },
    });
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.http)).toBe(true);
    expect(Object.isFrozen(config.notion)).toBe(true);
    expect(Object.isFrozen(config.notion.operatorUserIds)).toBe(true);
    expect(Object.isFrozen(config.discord)).toBe(true);
    expect(Object.isFrozen(config.capabilities)).toBe(true);
    expect(Object.isFrozen(config.retentionDays)).toBe(true);
  });

  it("rejects a missing secret without rendering its value", () => {
    const environment = {
      ...developmentEnvironment,
      NOTION_TOKEN: undefined,
    } satisfies NodeJS.ProcessEnv;

    try {
      loadConfig(environment);
      throw new Error("expected configuration validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      const message = (error as Error).message;
      expect(message).toContain("invalid runtime configuration");
      expect(message).toContain("NOTION_TOKEN");
      expect(message).not.toContain("notion-development-token");
      expect(message).not.toContain("discord-development-token");
    }
  });

  it("rejects a malformed database URL", () => {
    expect(() =>
      loadConfig({ ...developmentEnvironment, DATABASE_URL: "not-a-url" }),
    ).toThrow("invalid runtime configuration");
  });

  it("rejects an unsupported runtime environment", () => {
    expect(() =>
      loadConfig({ ...developmentEnvironment, NODE_ENV: "test" }),
    ).toThrow("invalid runtime configuration");
  });

  it.each([
    "DATABASE_ENVIRONMENT",
    "NOTION_ENVIRONMENT",
    "DISCORD_ENVIRONMENT",
  ] as const)(
    "rejects production when %s declares development provenance",
    (provenanceField) => {
      expect(() =>
        loadConfig({
          ...developmentEnvironment,
          NODE_ENV: "production",
          DATABASE_ENVIRONMENT: "production",
          NOTION_ENVIRONMENT: "production",
          DISCORD_ENVIRONMENT: "production",
          [provenanceField]: "development",
        }),
      ).toThrow("invalid runtime configuration");
    },
  );

  it("rejects a retention period outside the bounded positive range", () => {
    expect(() =>
      loadConfig({ ...developmentEnvironment, RETENTION_AUDIT_DAYS: "0" }),
    ).toThrow("invalid runtime configuration");
    expect(() =>
      loadConfig({ ...developmentEnvironment, RETENTION_AUDIT_DAYS: "3651" }),
    ).toThrow("invalid runtime configuration");
  });

  it("rejects an invalid capability ownership map", () => {
    expect(() =>
      loadConfig({
        ...developmentEnvironment,
        CAPABILITY_OWNERSHIP: '{"orders":"shared"}',
      }),
    ).toThrow("invalid runtime configuration");
  });
});
