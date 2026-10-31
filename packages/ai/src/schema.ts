import { Type, type TSchema } from "@earendil-works/pi-ai/compat";
import type { z } from "zod";

/**
 * Convert a Zod schema to a TypeBox schema for pi-ai tool definitions.
 * Supports common types: string, number, boolean, object, array, optional, enum, nullable.
 *
 * Reads Zod's internal `_def`. Zod 4 renamed the discriminator from
 * `_def.typeName` (PascalCase, e.g. "ZodString") to `_def.type` (lowercase,
 * e.g. "string"), and changed enum (`values`→`entries`) and literal storage.
 * Both shapes are handled so this works under zod 3 and zod 4.
 */
export function zodToTypeBox(schema: z.ZodTypeAny): TSchema {
  // Access internal Zod definition - ZodTypeAny doesn't expose _def in types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = (schema as any)._def;
  if (!def) {
    return Type.Any();
  }

  // v4: type (a string); v3: typeName. v3 ZodArray also has `type`, but it is the element schema.
  const typeName: string = typeof def.type === "string" ? def.type : def.typeName;

  // v3 stores .describe() in _def.description; v4 registers it as meta,
  // exposed via the schema's `description` getter.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const description: string | undefined = def.description ?? (schema as any).description;
  const opts = description ? { description } : undefined;

  switch (typeName) {
    case "ZodString":
    case "string":
      return Type.String(opts);

    case "ZodNumber":
    case "number":
      return Type.Number(opts);

    case "ZodBoolean":
    case "boolean":
      return Type.Boolean(opts);

    case "ZodObject":
    case "object": {
      const shape = typeof def.shape === "function" ? def.shape() : def.shape;
      if (!shape) return Type.Object({}, opts);
      const properties: Record<string, TSchema> = {};
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = zodToTypeBox(value as z.ZodTypeAny);
      }
      return Type.Object(properties, opts);
    }

    case "ZodArray":
    case "array":
      return Type.Array(zodToTypeBox(def.element ?? def.type), opts);

    case "ZodOptional":
    case "optional":
      return Type.Optional(withDescription(zodToTypeBox(def.innerType), description));

    case "ZodNullable":
    case "nullable":
      return Type.Union([zodToTypeBox(def.innerType), Type.Null()], opts);

    case "ZodEnum":
    case "enum": {
      // v4: entries (object); v3: values (array)
      const values: string[] = def.entries ? Object.keys(def.entries) : (def.values as string[]);
      return Type.Union(
        values.map((v: string) => Type.Literal(v)),
        opts,
      );
    }

    case "ZodLiteral":
    case "literal": {
      // v3: value; v4: values (array or object)
      const v =
        def.value ?? (Array.isArray(def.values) ? def.values[0] : Object.keys(def.values)[0]);
      return Type.Literal(v, opts);
    }

    case "ZodDefault":
    case "default":
      // The model may omit a defaulted field; Zod fills in the default.
      return Type.Optional(withDescription(zodToTypeBox(def.innerType), description));

    case "ZodEffects":
    case "pipe": // v4 models transforms as a "pipe" with .in/.out
      return zodToTypeBox(def.schema ?? def.in);

    default:
      return Type.Any();
  }
}

/** Carry a wrapper's `.describe()` onto the schema it wraps (inner descriptions win). */
function withDescription(schema: TSchema, description: string | undefined): TSchema {
  return description && !(schema as { description?: string }).description
    ? ({ ...schema, description } as TSchema)
    : schema;
}
