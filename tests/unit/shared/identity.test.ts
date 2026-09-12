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
});
