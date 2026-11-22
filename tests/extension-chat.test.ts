import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../extension/lib/markdown.js";
import { applyChunk, pendingActivity } from "../extension/chat.js";

describe("side panel markdown is safe", () => {
  it("never passes raw HTML or script URLs through", () => {
    const out = renderMarkdown('Hi <img src=x onerror="alert(1)"> <script>alert(2)</script> [x](javascript:alert(3)) [ok](https://a.dev/?q="x")');
    expect(out).not.toMatch(/<img|<script|href="javascript|onerror="/);
    expect(out).toContain("[x](javascript:alert(3))"); // left as inert text, not a link
    expect(out).toContain("&lt;img");
    expect(out).toContain('<a href="https://a.dev/?q=&quot;x&quot;" target="_blank" rel="noopener noreferrer">ok</a>');
  });

  it("renders the formatting Focus AI uses", () => {
    const out = renderMarkdown("## Plan\n\n- **Write** the `intro`\n- *edit*\n\n1. one\n2. two\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```\nx < y\n```");
    expect(out).toContain("<h4>Plan</h4>");
    expect(out).toContain("<li><strong>Write</strong> the <code>intro</code></li>");
    expect(out).toContain("<em>edit</em>");
    expect(out).toContain("<ol><li>one</li><li>two</li></ol>");
    expect(out).toContain("<th>a</th>");
    expect(out).toContain("<pre><code>x &lt; y</code></pre>");
  });
});

describe("side panel chat stream assembly", () => {
  it("folds UI-message-stream chunks into text, reasoning and tool parts", () => {
    const msg = { id: "local", role: "assistant", parts: [] as Record<string, unknown>[] };
    const chunks = [
      { type: "start", messageId: "msg_1" },
      { type: "start-step" },
      { type: "reasoning-start", id: "r" }, { type: "reasoning-delta", id: "r", delta: "Look at " }, { type: "reasoning-delta", id: "r", delta: "tasks" }, { type: "reasoning-end", id: "r" },
      { type: "tool-input-start", toolCallId: "c1", toolName: "list_tasks" },
      { type: "tool-input-available", toolCallId: "c1", toolName: "list_tasks", input: {} },
      { type: "tool-output-available", toolCallId: "c1", output: "- Write report" },
      { type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: "You have " }, { type: "text-delta", id: "t", delta: "one task." },
    ];
    for (const c of chunks) applyChunk(msg, c);
    expect(msg.id).toBe("msg_1");
    expect(msg.parts.find((p) => p.type === "reasoning")).toMatchObject({ text: "Look at tasks", state: "done" });
    expect(msg.parts.find((p) => p.type === "tool-list_tasks")).toMatchObject({ state: "output-available", output: "- Write report" });
    expect(msg.parts.find((p) => p.type === "text")).toMatchObject({ text: "You have one task.", state: "streaming" });
    // Text is visibly streaming → no extra "Thinking…" row; after the text ends there is a silent gap.
    expect(pendingActivity([msg], "streaming")).toBeNull();
    applyChunk(msg, { type: "text-end", id: "t" });
    expect(pendingActivity([msg], "streaming")).toBe("Thinking…");
    expect(pendingActivity([msg], "ready")).toBeNull();
  });
});
