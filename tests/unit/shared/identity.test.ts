import { describe, expect, it } from "vitest";
import {
  entityId,
  externalIdentityId,
} from "../../../src/shared/kernel/identity.js";

describe("entityId", () => {
  it("rejects a non-UUID value", () => {
    expect(() => entityId("not-an-id")).toThrow("invalid entity id");
  });
});

describe("externalIdentityId", () => {
  it("rejects an empty provider identity", () => {
    expect(() => externalIdentityId("")).toThrow(
      "invalid external identity id",
    );
  });

  it("accepts a 255-character provider identity", () => {
    const maximumLengthIdentity = "a".repeat(255);

    expect(externalIdentityId(maximumLengthIdentity)).toBe(
      maximumLengthIdentity,
    );
  });

  it("rejects a 256-character provider identity", () => {
    expect(() => externalIdentityId("a".repeat(256))).toThrow(
      "invalid external identity id",
    );
  });
});
