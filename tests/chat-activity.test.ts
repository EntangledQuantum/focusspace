import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { isNetworkError, pendingActivity } from "@/components/ai/chatActivity";

const asst = (...parts: object[]) => [{ id: "u", role: "user", parts: [{ type: "text", text: "hi" }] }, { id: "a", role: "assistant", parts }] as UIMessage[];

describe("pendingActivity", () => {
  it("shows a working row in the silent gaps", () => {
    expect(pendingActivity([], "submitted")).toBe("Thinking…");
    expect(pendingActivity(asst({ type: "step-start" }), "streaming")).toBe("Thinking…");
    // tool finished, next model step hasn't produced anything yet
    expect(pendingActivity(asst({ type: "tool-get_task", state: "output-available" }), "streaming")).toBe("Thinking…");
  });

  it("stays quiet while something is visibly streaming or the reply is done", () => {
    expect(pendingActivity(asst({ type: "text", text: "Hel", state: "streaming" }), "streaming")).toBeNull();
    expect(pendingActivity(asst({ type: "reasoning", text: "…", state: "streaming" }), "streaming")).toBeNull();
    expect(pendingActivity(asst({ type: "tool-start_timer", state: "input-available" }), "streaming")).toBeNull();
    expect(pendingActivity(asst({ type: "text", text: "Done", state: "done" }), "ready")).toBeNull();
  });
});

describe("isNetworkError", () => {
  it("treats dropped connections as recoverable, not provider errors or Stop", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new TypeError("network error"))).toBe(true);
    expect(isNetworkError(new Error("terminated"))).toBe(true);
    expect(isNetworkError(Object.assign(new Error("The user aborted a request."), { name: "AbortError" }))).toBe(false);
    expect(isNetworkError(new Error("Rate limited by the AI provider — wait a few seconds and try again."))).toBe(false);
  });
});
