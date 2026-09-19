export type EnvironmentName = "development" | "staging" | "production";

export type CapabilityOwner = "legacy" | "replacement" | "disabled";

export type RetentionClass = "inbox" | "audit" | "operations" | "documents";

export interface AppConfig {
  readonly environment: EnvironmentName;
  readonly databaseUrl: string;
  readonly http: { readonly host: string; readonly port: number };
  readonly notion: {
    readonly token: string;
    readonly contractVersion: string;
    readonly operatorUserIds: readonly string[];
  };
  readonly discord: {
    readonly token: string;
    readonly applicationId: string;
    readonly guildId: string;
  };
  readonly capabilities: Readonly<Record<string, CapabilityOwner>>;
  readonly retentionDays: Readonly<Record<RetentionClass, number>>;
}
