# AI Inference

Built-in LLM access via [`@earendil-works/pi-ai`](https://github.com/earendil-works/pi), giving you one API across providers (OpenAI, Anthropic, and more).

The adapter lives in `packages/ai` (`@groot/ai`). It simplifies common operations: text completion, streaming, structured data extraction with Zod, typed prompt tasks, and embeddings.

Import from the barrel (`@groot/ai`) or one of the explicit entrypoints in `packages/ai/package.json` (`@groot/ai/client`, `/capabilities`, `/messages`, `/model`, `/prompt`, `/schema`, `/types`); no other deep path resolves. `apps/web` does not depend on `@groot/ai` out of the box: add `"@groot/ai": "workspace:*"` to `apps/web/package.json` before importing it there. The pi-ai and OpenAI SDKs are dependencies of `@groot/ai` only, so app code reaches pi-ai through `ai.raw()` rather than importing it.

## Basic usage

```typescript
import { AI } from "@groot/ai";

const ai = new AI({ provider: "anthropic", model: "claude-sonnet-4-6" });

const text = await ai.complete("Translate 'hello world' to French.");

for await (const chunk of ai.stream("Write a short story...")) {
  process.stdout.write(chunk);
}
```

`AI` is an alias of `AIClient`. Without `baseUrl`, `provider` and `model` must name a model in pi-ai's catalog; the constructor throws `Unknown model` otherwise.

API keys are read automatically from standard env vars (e.g. `OPENAI_API_KEY`), or pass `apiKey` in the config to override. Provider keys are not in `envSchema`: the SDKs read them from `process.env`.

The Cloudflare gateway keys and `DEFAULT_MODEL` are in the validated env (`packages/core/src/env.ts`; listed in the [setup guide](../setup-guide.md)), so app code can pass them explicitly instead of relying on the SDK fallback:

```typescript
import { env } from "@groot/core/env";

const ai = new AI({
  provider: "cloudflare-ai-gateway",
  model: env.DEFAULT_MODEL ?? "claude-sonnet-4-5",
  apiKey: env.CLOUDFLARE_API_KEY,
});
```

## Cloudflare AI Gateway

pi-ai includes Cloudflare AI Gateway as a built-in provider (`cloudflare-ai-gateway`, as above). Given no `apiKey`, it reads `CLOUDFLARE_API_KEY` from `process.env`; it always reads `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_GATEWAY_ID` from there, since `AIConfig` has no field for them. The provider sends only `cf-aig-authorization`; keep provider keys in the gateway with BYOK.

## Custom OpenAI-compatible endpoints

For an endpoint that is not in pi-ai's provider catalog, set `baseUrl` and any
required headers directly. The catalog is bypassed, so `provider` is only a
label and `model` is passed through as-is:

```typescript
const ai = new AI({
  provider: "custom-gateway",
  model: "my-model",
  baseUrl: "https://gateway.example.com/v1",
  headers: { Authorization: "Bearer your-gateway-token" },
});
```

A custom model defaults to text and image input without reasoning; set `reasoning: true` or `input` in the config to change that.

## Structured output (Zod)

Define a Zod object schema and the model is forced to return matching data (via tool calling):

```typescript
import { z } from "zod";

const person = await ai.generateObject({
  prompt: "Extract: John Doe is a 30-year-old software engineer.",
  schema: z.object({
    name: z.string(),
    age: z.number(),
    occupation: z.string().optional(),
  }),
});
// { name: "John Doe", age: 30, occupation: "software engineer" }
```

The schema must be a `z.object`; anything else throws before a request is sent. Pass `messages` instead of `prompt` for a multi-message input.

## Prompt tasks

`definePrompt` packages a task once (typed input → messages → typed output); `ai.execute` runs it:

```typescript
import { definePrompt } from "@groot/ai";

const extractPerson = definePrompt({
  name: "extract-person",
  inputSchema: z.object({ text: z.string() }),
  outputSchema: z.object({ name: z.string(), age: z.number() }),
  getMessages: (input) => [
    { role: "system", content: "Extract person data from the text." },
    { role: "user", content: input.text },
  ],
});

const result = await ai.execute(extractPerson, { text: "Jane is 28." });

// Same prompt, different model on the same provider/endpoint:
const other = await ai.execute(
  extractPerson,
  { text: "Jane is 28." },
  { model: "claude-haiku-4-5" },
);
```

Input is validated against `inputSchema` before anything is sent; output is validated against `outputSchema` before it's returned. `ai.withModel(id)` returns a client for another model on the same provider/endpoint.

## Multimodal inputs

Prompt messages (`messages` in `generateObject`, `getMessages` in a prompt task) accept text, image, and file parts; `data` is base64, a `data:` URL, or bytes. A file part such as a PDF goes to pi-ai as a base64 block with its document mimeType:

```typescript
const summary = await ai.generateObject({
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: "Summarize this document." },
        { type: "file", mimeType: "application/pdf", data: pdfBytes },
      ],
    },
  ],
  schema: z.object({ summary: z.string() }),
});
```

`complete` and `stream` take pi-ai's own content blocks instead (`{ type: "image", data, mimeType }` with base64 `data`).

Use `getModelCapabilities(modelId)` to check whether a model accepts native documents or images before attaching files (e.g. to decide whether to rasterize a PDF to page images). It matches the model id against built-in rules (pass extra rules as a second argument); an unknown id reports images only:

```typescript
import { getModelCapabilities } from "@groot/ai";

const caps = getModelCapabilities("google/gemini-3-flash-preview");
// { nativeDocuments: true, nativeImages: true }
```

## Reasoning, embeddings, escape hatch

```typescript
// Thinking/reasoning models
await ai.complete({ prompt: "Solve this…", reasoning: "high" });

// Embeddings (OpenAI, defaults to text-embedding-3-small)
const vectors = await ai.embed(["text one", "text two"]);

// Full pi-ai primitives when the adapter is too limiting
const { model, complete, stream } = ai.raw();
```

`embed` always calls the OpenAI API, whatever `provider` and `baseUrl` say, and sends the config's `apiKey` when one is set (otherwise `OPENAI_API_KEY`). Use a separate client for embeddings when the main one holds another provider's key. `embeddingModel` in the config picks the model.
