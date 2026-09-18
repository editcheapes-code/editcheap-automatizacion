import { z } from "zod";

const entityIdSchema = z.uuid({ error: "invalid entity id" });
const externalIdentityIdSchema = z
  .string()
  .min(1, { error: "invalid external identity id" })
  .max(255, { error: "invalid external identity id" });

export type Brand<Value, Name extends string> = Value & {
  readonly __brand: Name;
};

export type EntityId = Brand<string, "EntityId">;
export type ExternalIdentityId = Brand<string, "ExternalIdentityId">;

export function entityId(value: string): EntityId {
  return entityIdSchema.parse(value) as EntityId;
}

export function externalIdentityId(value: string): ExternalIdentityId {
  return externalIdentityIdSchema.parse(value) as ExternalIdentityId;
}
