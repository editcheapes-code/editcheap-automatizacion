import type { z } from "zod";

/** Validates supplied environment values without loading files or reading globals. */
export function loadEnv<Schema extends z.ZodType>(
  schema: Schema,
  environment: NodeJS.ProcessEnv,
): z.output<Schema> {
  const result = schema.safeParse(environment);

  if (!result.success) {
    const fields = [
      ...new Set(
        result.error.issues.map((issue) =>
          issue.path.length === 0 ? "configuration" : issue.path.join("."),
        ),
      ),
    ];

    throw new Error(`invalid runtime configuration: ${fields.join(", ")}`);
  }

  return result.data;
}
