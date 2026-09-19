import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { loadEnv } from "../../../src/platform/config/load-env.js";

describe("loadEnv", () => {
  it("returns inferred values and ignores unrelated environment variables", () => {
    const schema = z.object({ TOKEN: z.string().min(1) });
    const env = loadEnv(schema, { TOKEN: "test-token", UNRELATED: "unused" });

    expectTypeOf(env).toEqualTypeOf<{ TOKEN: string }>();
    expect(env).toEqual({ TOKEN: "test-token" });
  });

  it("returns transformed values and defaults without mutating its input", () => {
    const schema = z.object({
      PORT: z.string().transform(Number).pipe(z.number().int()),
      HOST: z.string().default("localhost"),
    });
    const environment = Object.freeze({ PORT: "3100" });
    const env = loadEnv(schema, environment);

    expectTypeOf(env.PORT).toEqualTypeOf<number>();
    expect(env).toEqual({ PORT: 3100, HOST: "localhost" });
    expect(environment).toEqual({ PORT: "3100" });
  });

  it.each([{}, { TOKEN: "" }])(
    "rejects missing or empty required values",
    (env) => {
      expect(() =>
        loadEnv(z.object({ TOKEN: z.string().min(1) }), env),
      ).toThrow("invalid runtime configuration: TOKEN");
    },
  );

  it("omits rejected values and custom validation messages from errors", () => {
    const secret = "test-secret-must-not-appear";
    const schema = z.object({
      TOKEN: z.string().superRefine((value, context) => {
        context.addIssue({ code: "custom", message: `rejected ${value}` });
        context.addIssue({
          code: "custom",
          message: `still rejected ${value}`,
        });
      }),
    });

    expect(() => loadEnv(schema, { TOKEN: secret })).toThrow(
      new Error("invalid runtime configuration: TOKEN"),
    );
  });

  it("reports object-level validation failures without their messages", () => {
    const schema = z.object({}).refine(() => false, "sensitive details");

    expect(() => loadEnv(schema, {})).toThrow(
      new Error("invalid runtime configuration: configuration"),
    );
  });

  it("preserves readonly schema output", () => {
    const schema = z.object({ TOKEN: z.string() }).readonly();
    const env = loadEnv(schema, { TOKEN: "test-token" });

    expectTypeOf(env).toEqualTypeOf<Readonly<{ TOKEN: string }>>();
    expect(Object.isFrozen(env)).toBe(true);
  });
});
