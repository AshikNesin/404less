import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import { zodToTypeBox } from "@groot/ai";

describe("zodToTypeBox", () => {
  it("converts primitives", () => {
    expect(zodToTypeBox(z.string())).toEqual({ type: "string" });
    expect(zodToTypeBox(z.number())).toEqual({ type: "number" });
    expect(zodToTypeBox(z.boolean())).toEqual({ type: "boolean" });
  });

  it("carries descriptions", () => {
    expect(zodToTypeBox(z.string().describe("a name"))).toEqual({
      type: "string",
      description: "a name",
    });
  });

  it("converts objects, arrays, enums, nullable and defaults (zod 4)", () => {
    const out =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      zodToTypeBox(
        z.object({
          name: z.string(),
          tags: z.array(z.string()).optional(),
          kind: z.enum(["a", "b"]),
          note: z.string().nullable(),
          count: z.number().default(3),
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ) as any;

    expect(out.type).toBe("object");
    expect(out.properties.name).toEqual({ type: "string" });
    expect(out.properties.tags).toMatchObject({ type: "array", items: { type: "string" } });
    expect(out.properties.kind).toMatchObject({ anyOf: [{ const: "a" }, { const: "b" }] });
    expect(out.properties.note).toMatchObject({ anyOf: [{ type: "string" }, { type: "null" }] });
    expect(out.properties.count).toMatchObject({ type: "number" });
    // a defaulted field may be omitted by the model; Zod applies the default
    expect(out.required).toEqual(["name", "kind", "note"]);
  });

  it("keeps .describe() on objects, arrays, enums, literals and wrappers", () => {
    const d = (s: string) => ({ description: s });
    expect(zodToTypeBox(z.object({ a: z.string() }).describe("obj"))).toMatchObject(d("obj"));
    expect(zodToTypeBox(z.array(z.string()).describe("arr"))).toMatchObject(d("arr"));
    expect(zodToTypeBox(z.enum(["x", "y"]).describe("en"))).toMatchObject(d("en"));
    expect(zodToTypeBox(z.literal("x").describe("lit"))).toMatchObject(d("lit"));
    expect(zodToTypeBox(z.string().nullable().describe("nul"))).toMatchObject(d("nul"));
    expect(zodToTypeBox(z.string().optional().describe("opt"))).toMatchObject(d("opt"));
    expect(zodToTypeBox(z.number().default(1).describe("def"))).toMatchObject(d("def"));
  });

  it("unwraps transforms to their input schema", () => {
    expect(zodToTypeBox(z.string().transform((s) => s.length))).toEqual({ type: "string" });
  });
});
