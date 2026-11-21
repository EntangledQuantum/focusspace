import { describe, expect, it } from "vitest";
import {
  checkBaseUrl, filterModels, isProxyLike, litellmRoot, mergeModels, normalizeBaseUrl, parseLiteLLMInfo, parseModelList,
} from "@/lib/ai/models";
import { friendlyAiError } from "@/lib/ai/errors";

describe("base URL handling", () => {
  it("strips trailing slashes and pasted endpoint suffixes", () => {
    expect(normalizeBaseUrl(" https://api.openai.com/v1/ ")).toBe("https://api.openai.com/v1");
    expect(normalizeBaseUrl("https://api.openai.com/v1/chat/completions")).toBe("https://api.openai.com/v1");
    expect(normalizeBaseUrl("https://proxy.example.com/v1/models/")).toBe("https://proxy.example.com/v1");
  });

  it("derives the LiteLLM root from a /v1 base", () => {
    expect(litellmRoot("https://llm.example.com/v1")).toBe("https://llm.example.com");
    expect(litellmRoot("https://llm.example.com/litellm")).toBe("https://llm.example.com/litellm");
  });

  it("only treats unknown hosts as possible proxies", () => {
    expect(isProxyLike("https://llm.example.com/v1")).toBe(true);
    expect(isProxyLike("https://api.openai.com/v1")).toBe(false);
    expect(isProxyLike("https://generativelanguage.googleapis.com/v1beta/openai")).toBe(false);
    expect(isProxyLike("http://localhost:11434/v1")).toBe(false);
  });

  it("refuses private addresses in the hosted app but allows them locally", () => {
    for (const url of ["http://localhost:11434/v1", "http://127.0.0.1:4000", "http://169.254.169.254/latest", "http://10.0.0.5/v1", "http://[::1]:4000", "http://192.168.1.2"]) {
      expect(checkBaseUrl(url, { allowPrivate: false }).ok).toBe(false);
    }
    expect(checkBaseUrl("http://localhost:11434/v1", { allowPrivate: true })).toEqual({ ok: true, url: "http://localhost:11434/v1" });
    expect(checkBaseUrl("https://openrouter.ai/api/v1/", { allowPrivate: false })).toEqual({ ok: true, url: "https://openrouter.ai/api/v1" });
    expect(checkBaseUrl("ftp://x.example.com", { allowPrivate: false }).ok).toBe(false);
    expect(checkBaseUrl("https://user:pw@x.example.com/v1", { allowPrivate: false }).ok).toBe(false);
    expect(checkBaseUrl("not a url", { allowPrivate: true }).ok).toBe(false);
  });
});

describe("parseModelList", () => {
  it("reads the OpenAI shape and drops non-chat models", () => {
    const models = mergeModels(parseModelList({
      object: "list",
      data: [
        { id: "gpt-4o-mini", owned_by: "openai" },
        { id: "text-embedding-3-small", owned_by: "openai" },
        { id: "whisper-1" },
        { id: "gpt-4o", owned_by: "openai" },
        { id: "gpt-4o", owned_by: "openai" },
      ],
    }));
    expect(models.map((m) => m.id)).toEqual(["gpt-4o", "gpt-4o-mini"]);
  });

  it("strips Gemini's models/ prefix", () => {
    const [m] = parseModelList({ data: [{ id: "models/gemini-2.5-flash", owned_by: "google" }] });
    expect(m.id).toBe("gemini-2.5-flash");
  });

  it("reads OpenRouter tool support and context length", () => {
    const [a, b] = parseModelList({
      data: [
        { id: "x/with-tools", name: "With Tools", context_length: 128000, supported_parameters: ["tools", "temperature"] },
        { id: "y/no-tools", context_length: 8192, supported_parameters: ["temperature"] },
      ],
    });
    expect(a).toMatchObject({ id: "x/with-tools", label: "With Tools", contextWindow: 128000, supportsTools: true });
    expect(b.supportsTools).toBe(false);
  });

  it("reads Anthropic display names without treating type:model as a mode", () => {
    const [m] = parseModelList({ data: [{ id: "claude-x", display_name: "Claude X", type: "model" }] });
    expect(m).toMatchObject({ id: "claude-x", label: "Claude X", mode: undefined });
  });

  it("reads Ollama's native list and bare arrays", () => {
    expect(parseModelList({ models: [{ name: "llama3.2:3b" }] }).map((m) => m.id)).toEqual(["llama3.2:3b"]);
    expect(parseModelList(["a", "b"]).map((m) => m.id)).toEqual(["a", "b"]);
    expect(parseModelList({ error: "nope" })).toEqual([]);
    expect(parseModelList(null)).toEqual([]);
  });

  it("keeps only chat-completions models from gateways that list several APIs", () => {
    // Shape returned by OpenCode's model list: capabilities/limit/api per model.
    const models = mergeModels(parseModelList({
      data: [
        { id: "glm-flash", type: "chat", capabilities: { tools: { supported: true } }, limit: { context: 1000000 }, api: { "chat-completions": {} } },
        { id: "gpt-resp", type: "chat", api: { responses: {} } },
        { id: "claude-msg", type: "chat", api: { messages: {} } },
      ],
    }));
    expect(models).toEqual([
      { id: "glm-flash", label: undefined, provider: undefined, contextWindow: 1000000, supportsTools: true, mode: "chat", apis: ["chat-completions"] },
    ]);
  });
});

describe("LiteLLM metadata", () => {
  it("parses /model_group/info and enriches the /models list", () => {
    const info = parseLiteLLMInfo({
      data: [
        { model_group: "claude-sonnet", providers: ["anthropic"], max_input_tokens: 200000, supports_function_calling: true, mode: "chat" },
        { model_group: "embed", providers: ["openai"], mode: "embedding" },
      ],
    });
    const merged = mergeModels(parseModelList({ data: [{ id: "claude-sonnet" }, { id: "embed" }, { id: "anthropic/*" }] }), info);
    expect(merged).toEqual([
      { id: "claude-sonnet", provider: "anthropic", contextWindow: 200000, supportsTools: true, mode: "chat" },
    ]);
  });

  it("merges several /model/info deployments of one model name", () => {
    const info = parseLiteLLMInfo({
      data: [
        { model_name: "fast", litellm_params: { model: "openai/gpt-4o-mini" }, model_info: { max_input_tokens: 128000, supports_function_calling: false } },
        { model_name: "fast", litellm_params: { model: "groq/llama" }, model_info: { max_input_tokens: 32000, supports_function_calling: true, litellm_provider: "groq" } },
      ],
    });
    expect(info.get("fast")).toMatchObject({ provider: "openai", contextWindow: 128000, supportsTools: true });
  });

  it("falls back to model-group names when /models is empty", () => {
    const info = parseLiteLLMInfo({ data: [{ model_group: "gemini-2.5-flash", mode: "chat" }] });
    expect(mergeModels([], info).map((m) => m.id)).toEqual(["gemini-2.5-flash"]);
  });
});

describe("filterModels", () => {
  const models = [
    { id: "gpt-4o-mini", provider: "openai" },
    { id: "claude-sonnet", label: "Claude Sonnet", provider: "anthropic" },
    { id: "gemini-2.5-flash", provider: "google" },
  ];
  it("matches every search term against id, label and provider", () => {
    expect(filterModels(models, "").length).toBe(3);
    expect(filterModels(models, "anthropic").map((m) => m.id)).toEqual(["claude-sonnet"]);
    expect(filterModels(models, "gemini flash").map((m) => m.id)).toEqual(["gemini-2.5-flash"]);
    expect(filterModels(models, "gemini pro")).toEqual([]);
  });
});

describe("friendlyAiError", () => {
  const apiError = (statusCode: number, responseBody: string) =>
    Object.assign(new Error(`HTTP ${statusCode}`), { statusCode, responseBody });

  it("maps auth, quota, tools, context, missing model and rate limits", () => {
    expect(friendlyAiError(apiError(401, "Invalid API key"))).toMatch(/rejected the API key/);
    expect(friendlyAiError(apiError(429, '{"error":{"code":"insufficient_quota"}}'))).toMatch(/budget or quota/);
    expect(friendlyAiError(apiError(400, "LiteLLM: ExceededBudget: User=abc over budget"))).toMatch(/budget or quota/);
    expect(friendlyAiError(apiError(404, "No endpoints found that support tool use"), { modelId: "x/y" })).toMatch(/"x\/y" doesn't support tool calling/);
    expect(friendlyAiError(apiError(400, "This model's maximum context length is 8192 tokens"))).toMatch(/too long/);
    expect(friendlyAiError(apiError(404, "The model `gpt-9` does not exist"), { modelId: "gpt-9" })).toMatch(/"gpt-9" isn't available/);
    expect(friendlyAiError(apiError(429, "Rate limit reached"))).toMatch(/Rate limited/);
    expect(friendlyAiError(apiError(503, "upstream overloaded"))).toMatch(/Couldn't reach .*\(503\)/);
  });

  it("unwraps retry errors to the last provider error", () => {
    const retry = Object.assign(new Error("Failed after 3 attempts"), { lastError: apiError(401, "Unauthorized") });
    expect(friendlyAiError(retry)).toMatch(/rejected the API key/);
  });

  it("falls back to the first line of an unknown message", () => {
    expect(friendlyAiError(new Error("Something odd\nstack…"))).toBe("Something odd");
  });
});
