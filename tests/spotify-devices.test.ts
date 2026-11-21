import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NO_DEVICE_MESSAGE, PREMIUM_REQUIRED_MESSAGE, describeSpotifyFailure, rankDevices, type SpotifyDevice,
} from "@/lib/spotify/devices";
import { clearDeviceCache, describeNowPlaying, runPlayback, type PlaybackHints } from "@/lib/spotify/playback";

const dev = (name: string, type: string, extra: Partial<SpotifyDevice> = {}): SpotifyDevice => ({
  id: `id-${name.toLowerCase().replace(/\s+/g, "-")}`, name, type, is_active: false, is_restricted: false, ...extra,
});

describe("rankDevices", () => {
  it("prefers the active device over everything, even the web player", () => {
    const list = [dev("FocusSpace", "Computer"), dev("Phone", "Smartphone", { is_active: true })];
    expect(rankDevices(list, "id-focusspace")[0].name).toBe("Phone");
  });

  it("picks the registered web player when nothing is active, even if Spotify lists it last", () => {
    const list = [dev("Laptop", "Computer"), dev("Phone", "Smartphone"), dev("Tab", "Computer", { id: "sdk-1" })];
    expect(rankDevices(list, "sdk-1")[0].id).toBe("sdk-1");
  });

  it("falls back to a device named like the web player when the stored id is stale", () => {
    const list = [dev("Laptop", "Computer"), dev("FocusSpace", "Computer", { id: "sdk-new" })];
    expect(rankDevices(list, "sdk-old")[0].id).toBe("sdk-new");
  });

  it("prefers computer → smartphone → others, keeping Spotify's order on ties, and drops unusable devices", () => {
    const list = [
      dev("Speaker", "Speaker"),
      dev("Phone", "Smartphone"),
      dev("Desk", "Computer"),
      dev("Work", "Computer"),
      dev("Car", "Automobile", { is_restricted: true }),
      dev("Ghost", "Computer", { id: null }),
    ];
    expect(rankDevices(list).map((d) => d.name)).toEqual(["Desk", "Work", "Phone", "Speaker"]);
  });

  it("skips a restricted active device", () => {
    const list = [dev("TV", "TV", { is_active: true, is_restricted: true }), dev("Phone", "Smartphone")];
    expect(rankDevices(list)[0].name).toBe("Phone");
  });
});

describe("describeSpotifyFailure", () => {
  it("maps 404 NO_ACTIVE_DEVICE to the actionable no-device message", () => {
    const r = describeSpotifyFailure(404, { error: { status: 404, message: "Player command failed: No active device found", reason: "NO_ACTIVE_DEVICE" } });
    expect(r).toEqual({ code: "no_device", message: NO_DEVICE_MESSAGE });
  });

  it("says Premium is required on 403 PREMIUM_REQUIRED", () => {
    const r = describeSpotifyFailure(403, { error: { status: 403, message: "Player command failed: Premium required", reason: "PREMIUM_REQUIRED" } });
    expect(r).toEqual({ code: "premium_required", message: PREMIUM_REQUIRED_MESSAGE });
  });

  it("does not blame Premium for other 403s", () => {
    const r = describeSpotifyFailure(403, { error: { message: "Player command failed: Restriction violated", reason: "UNKNOWN" } }, { verb: "Pause" });
    expect(r.code).toBe("restricted");
    expect(r.message).toContain("Restriction violated");
  });

  it("reports how long to wait on 429", () => {
    expect(describeSpotifyFailure(429, null, { retryAfterSec: 30 }).message).toContain("30s");
    expect(describeSpotifyFailure(429, null).code).toBe("rate_limited");
  });
});

// ── runPlayback against a scripted Spotify ─────────────────────────────────
type Reply = { status: number; body?: unknown; headers?: Record<string, string> };
interface Call { method: string; path: string; params: Record<string, string>; body: unknown }

function fakeSpotify(script: Record<string, Reply | Reply[]>) {
  const calls: Call[] = [];
  const queues = new Map(Object.entries(script).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]));
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const path = url.pathname.replace(/^\/v1/, "");
    calls.push({
      method, path,
      params: Object.fromEntries(url.searchParams),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const q = queues.get(`${method} ${path}`);
    // The last scripted reply repeats; unscripted endpoints are a test bug.
    const reply = q && (q.length > 1 ? q.shift()! : q[0]);
    if (!reply) throw new Error(`unscripted Spotify call: ${method} ${path}`);
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status, headers: reply.headers,
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

const NO_ACTIVE = { status: 404, body: { error: { status: 404, message: "Player command failed: No active device found", reason: "NO_ACTIVE_DEVICE" } } };
const hints = (h: Partial<PlaybackHints> = {}) => async (): Promise<PlaybackHints> => ({
  webDeviceId: null, webDeviceSeenAt: null, selectedUri: null, selectedName: null, ...h,
});

beforeEach(() => clearDeviceCache());
afterEach(() => vi.unstubAllGlobals());

describe("runPlayback device resolution", () => {
  it("costs one call when a device is already active", async () => {
    const calls = fakeSpotify({ "PUT /me/player/play": { status: 204 } });
    const r = await runPlayback("t", { kind: "resume" }, hints());
    expect(r).toMatchObject({ ok: true, message: "Resumed." });
    expect(calls).toHaveLength(1);
    expect(calls[0].params.device_id).toBeUndefined();
  });

  it("resume with nothing active starts the last-played playlist on the FocusSpace web player (the reported bug)", async () => {
    const calls = fakeSpotify({
      "PUT /me/player/play": [NO_ACTIVE, { status: 204 }],
      "GET /me/player/devices": { status: 200, body: { devices: [dev("Phone", "Smartphone"), dev("FocusSpace", "Computer", { id: "sdk-1" })] } },
      "GET /me/player/recently-played": { status: 200, body: { items: [{ track: { uri: "spotify:track:abc", name: "Weightless", artists: [{ name: "Marconi Union" }] }, context: { uri: "spotify:playlist:focus" } }] } },
    });
    const r = await runPlayback("t", { kind: "resume" }, hints({ webDeviceId: "sdk-1" }));
    expect(r).toMatchObject({ ok: true, device: "FocusSpace" });
    expect(r.message).toContain("Weightless");
    const play = calls.filter((c) => c.method === "PUT" && c.path === "/me/player/play")[1];
    expect(play.params.device_id).toBe("sdk-1");
    expect(play.body).toEqual({ context_uri: "spotify:playlist:focus", offset: { uri: "spotify:track:abc" } });
    expect(calls.some((c) => c.path === "/me/player" && c.method === "PUT")).toBe(false); // no transfer needed
  });

  it("transfers playback to a web player Spotify doesn't treat as a target yet, then retries", async () => {
    const calls = fakeSpotify({
      "PUT /me/player/play": [NO_ACTIVE, { status: 404, body: { error: { message: "Device not found" } } }, { status: 204 }],
      "GET /me/player/devices": { status: 200, body: { devices: [dev("FocusSpace", "Computer", { id: "sdk-1" })] } },
      "PUT /me/player": { status: 204 },
    });
    const r = await runPlayback("t", { kind: "play", uri: "spotify:album:x" }, hints());
    expect(r).toMatchObject({ ok: true, message: "Playing spotify:album:x on FocusSpace." });
    const transfer = calls.find((c) => c.method === "PUT" && c.path === "/me/player");
    expect(transfer?.body).toEqual({ device_ids: ["sdk-1"], play: false });
    expect(calls.at(-1)).toMatchObject({ path: "/me/player/play", params: { device_id: "sdk-1" }, body: { context_uri: "spotify:album:x" } });
  });

  it("resume falls back to the FocusSpace music pick when there is no listening history", async () => {
    const calls = fakeSpotify({
      "PUT /me/player/play": [NO_ACTIVE, { status: 204 }],
      "GET /me/player/devices": { status: 200, body: { devices: [dev("Laptop", "Computer")] } },
      "GET /me/player/recently-played": { status: 200, body: { items: [] } },
    });
    const r = await runPlayback("t", { kind: "resume" }, hints({ selectedUri: "spotify:playlist:lofi", selectedName: "Lofi" }));
    expect(r).toMatchObject({ ok: true, device: "Laptop" });
    expect(r.message).toContain("Lofi");
    expect(calls.at(-1)).toMatchObject({ params: { device_id: "id-laptop" }, body: { context_uri: "spotify:playlist:lofi" } });
  });

  it("returns one clear message when truly no device exists", async () => {
    fakeSpotify({
      "POST /me/player/next": NO_ACTIVE,
      "GET /me/player/devices": { status: 200, body: { devices: [] } },
    });
    expect(await runPlayback("t", { kind: "next" }, hints())).toEqual({ ok: false, code: "no_device", message: NO_DEVICE_MESSAGE });
  });

  it("tries a recently reported web player even before Spotify lists it", async () => {
    const calls = fakeSpotify({
      "PUT /me/player/volume": [NO_ACTIVE, { status: 204 }],
      "GET /me/player/devices": { status: 200, body: { devices: [] } },
    });
    const r = await runPlayback("t", { kind: "volume", percent: 40 }, hints({ webDeviceId: "sdk-9", webDeviceSeenAt: new Date().toISOString() }));
    expect(r).toMatchObject({ ok: true, message: "Volume set to 40% on FocusSpace." });
    expect(calls.at(-1)?.params).toEqual({ volume_percent: "40", device_id: "sdk-9" });
  });

  it("does not look for devices on 403 PREMIUM_REQUIRED", async () => {
    const calls = fakeSpotify({
      "PUT /me/player/play": { status: 403, body: { error: { status: 403, message: "Player command failed: Premium required", reason: "PREMIUM_REQUIRED" } } },
    });
    expect(await runPlayback("t", { kind: "play", uri: "spotify:track:a" }, hints())).toEqual({
      ok: false, code: "premium_required", message: PREMIUM_REQUIRED_MESSAGE,
    });
    expect(calls).toHaveLength(1);
  });

  it("treats pause with no active device as nothing playing, without further calls", async () => {
    const calls = fakeSpotify({ "PUT /me/player/pause": NO_ACTIVE });
    expect(await runPlayback("t", { kind: "pause" }, hints())).toMatchObject({ ok: true, message: "Nothing is playing." });
    expect(calls).toHaveLength(1);
  });

  it("waits out a short 429 Retry-After and reports a long one", async () => {
    let calls = fakeSpotify({ "POST /me/player/next": [{ status: 429, headers: { "Retry-After": "0" } }, { status: 204 }] });
    expect(await runPlayback("t", { kind: "next" }, hints())).toMatchObject({ ok: true });
    expect(calls).toHaveLength(2);

    calls = fakeSpotify({ "POST /me/player/next": { status: 429, headers: { "Retry-After": "30" } } });
    expect(await runPlayback("t", { kind: "next" }, hints())).toMatchObject({ ok: false, code: "rate_limited", message: expect.stringContaining("30s") });
    expect(calls).toHaveLength(1);
  });

  it("caches the device list for back-to-back commands", async () => {
    const calls = fakeSpotify({
      "POST /me/player/next": [NO_ACTIVE, { status: 204 }, NO_ACTIVE, { status: 204 }],
      "GET /me/player/devices": { status: 200, body: { devices: [dev("Laptop", "Computer")] } },
    });
    await runPlayback("t", { kind: "next" }, hints());
    await runPlayback("t", { kind: "next" }, hints());
    expect(calls.filter((c) => c.path === "/me/player/devices")).toHaveLength(1);
  });
});

describe("describeNowPlaying", () => {
  it("names the device when something is playing", async () => {
    fakeSpotify({
      "GET /me/player": { status: 200, body: { is_playing: true, device: { name: "FocusSpace", type: "Computer" }, item: { name: "Weightless", artists: [{ name: "Marconi Union" }] } } },
    });
    expect(await describeNowPlaying("t", hints())).toBe("Playing: Weightless — Marconi Union on FocusSpace (Computer).");
  });

  it("says no device is active but the web player is ready", async () => {
    fakeSpotify({
      "GET /me/player": { status: 204 },
      "GET /me/player/devices": { status: 200, body: { devices: [dev("FocusSpace", "Computer", { id: "sdk-1" })] } },
    });
    const text = await describeNowPlaying("t", hints({ webDeviceId: "sdk-1" }));
    expect(text).toContain("no Spotify device is active");
    expect(text).toContain("FocusSpace web player is open");
  });
});
