import { describe, expect, it } from "vite-plus/test";
import { toPiContext } from "@groot/ai";

describe("toPiContext", () => {
  it("merges system messages after an explicit system prompt", () => {
    const ctx = toPiContext(
      [
        { role: "system", content: "You extract data." },
        { role: "user", content: "Hello" },
      ],
      "Base instructions.",
    );
    expect(ctx.systemPrompt).toBe("Base instructions.\n\nYou extract data.");
    expect(ctx.messages).toHaveLength(1);
    expect(ctx.messages[0]).toMatchObject({ role: "user", content: "Hello" });
  });

  it("normalizes text, image and file parts to pi-ai blocks", () => {
    const ctx = toPiContext([
      {
        role: "user",
        content: [
          { type: "text", text: "Extract this" },
          { type: "image", data: "aW1n", mimeType: "image/png" },
          { type: "file", data: "cGRm", mimeType: "application/pdf" },
        ],
      },
    ]);
    expect(ctx.messages[0].content).toEqual([
      { type: "text", text: "Extract this" },
      { type: "image", data: "aW1n", mimeType: "image/png" },
      { type: "image", data: "cGRm", mimeType: "application/pdf" },
    ]);
  });

  it("strips data: URL prefixes and converts bytes to base64", () => {
    const ctx = toPiContext([
      {
        role: "user",
        content: [
          { type: "image", data: "data:image/png;base64,aW1n", mimeType: "image/png" },
          { type: "image", data: new URL("data:image/png;base64,dXJs"), mimeType: "image/png" },
          { type: "image", data: new TextEncoder().encode("raw"), mimeType: "image/png" },
        ],
      },
    ]);
    const blocks = ctx.messages[0].content as Array<{ data: string }>;
    expect(blocks[0].data).toBe("aW1n");
    expect(blocks[1].data).toBe("dXJs");
    expect(blocks[2].data).toBe(Buffer.from("raw").toString("base64"));
  });

  it("takes an image's media type from its data: URL when none is given", () => {
    const ctx = toPiContext([
      {
        role: "user",
        content: [
          { type: "image", data: "data:image/jpeg;base64,anBn" },
          { type: "image", data: new URL("data:image/webp;base64,d2Vi") },
          { type: "image", data: "cmF3" },
        ],
      },
    ]);
    const blocks = ctx.messages[0].content as Array<{ mimeType: string }>;
    expect(blocks.map((b) => b.mimeType)).toEqual(["image/jpeg", "image/webp", "image/png"]);
  });

  it("rejects non-data URLs with a clear error", () => {
    expect(() =>
      toPiContext([
        {
          role: "user",
          content: [{ type: "image", data: new URL("https://example.com/x.png") }],
        },
      ]),
    ).toThrow(/data: URLs/);
  });
});
