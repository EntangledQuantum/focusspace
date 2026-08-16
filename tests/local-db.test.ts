import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("local sqlite", () => {
  let dir: string;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "fs-test-"));
    process.env.FOCUSSPACE_DATA_DIR = dir;
    process.env.FOCUSSPACE_MODE = "local";
    const { resetSqliteForTests } = await import("@/lib/local/db");
    resetSqliteForTests(path.join(dir, "focusspace.db"));
  });

  afterEach(async () => {
    const { closeSqlite } = await import("@/lib/local/db");
    closeSqlite();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* windows file lock */ }
  });

  it("bootstraps a profile, settings, project and tag", async () => {
    const { executeQuery } = await import("@/lib/local/execute");
    const { LOCAL_USER_ID } = await import("@/lib/local/ids");
    const profile = executeQuery({ table: "profiles", op: "select", filters: [{ kind: "eq", col: "id", value: LOCAL_USER_ID }], maybeSingle: true });
    expect((profile.data as { display_name: string }).display_name).toBe("You");
    const projects = executeQuery({ table: "projects", op: "select", filters: [] });
    expect((projects.data as unknown[]).length).toBeGreaterThan(0);
  });

  it("inserts a task and lists it", async () => {
    const { executeQuery } = await import("@/lib/local/execute");
    const { LOCAL_USER_ID } = await import("@/lib/local/ids");
    const projects = executeQuery({ table: "projects", op: "select", filters: [] });
    const projectId = (projects.data as { id: string }[])[0].id;
    const created = executeQuery({
      table: "tasks",
      op: "insert",
      values: { user_id: LOCAL_USER_ID, project_id: projectId, title: "Write tests", estimated_pomodoros: 3 },
      single: true,
    });
    expect(created.error, created.error?.message).toBeNull();
    expect((created.data as { title: string }).title).toBe("Write tests");
    const listed = executeQuery({
      table: "tasks",
      op: "select",
      filters: [{ kind: "eq", col: "title", value: "Write tests" }],
    });
    expect((listed.data as unknown[]).length).toBe(1);
  });

  it("resets subtasks and completed pomodoros", async () => {
    const { executeQuery } = await import("@/lib/local/execute");
    const { LOCAL_USER_ID } = await import("@/lib/local/ids");
    const projects = executeQuery({ table: "projects", op: "select", filters: [] });
    const projectId = (projects.data as { id: string }[])[0].id;
    const task = executeQuery({
      table: "tasks",
      op: "insert",
      values: { user_id: LOCAL_USER_ID, project_id: projectId, title: "Big one", estimated_pomodoros: 8, completed_pomodoros: 3 },
      single: true,
    });
    const taskId = (task.data as { id: string }).id;
    executeQuery({
      table: "subtasks",
      op: "insert",
      values: [
        { user_id: LOCAL_USER_ID, task_id: taskId, title: "A", done: true, sort_order: 0 },
        { user_id: LOCAL_USER_ID, task_id: taskId, title: "B", done: true, sort_order: 1 },
      ],
    });
    executeQuery({ table: "subtasks", op: "update", values: { done: false }, filters: [{ kind: "eq", col: "task_id", value: taskId }] });
    executeQuery({ table: "tasks", op: "update", values: { completed_pomodoros: 0 }, filters: [{ kind: "eq", col: "id", value: taskId }] });
    const subs = executeQuery({ table: "subtasks", op: "select", filters: [{ kind: "eq", col: "task_id", value: taskId }] });
    expect((subs.data as { done: boolean }[]).every((s) => s.done === false)).toBe(true);
    const t = executeQuery({ table: "tasks", op: "select", filters: [{ kind: "eq", col: "id", value: taskId }], single: true });
    expect((t.data as { completed_pomodoros: number }).completed_pomodoros).toBe(0);
  });
});
