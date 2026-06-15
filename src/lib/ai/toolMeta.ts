// Client-safe map: tool name → a verb + lucide icon name for the ToolCard.
// Icon names match lucide-react exports. `noun` (when set) lets the card show a
// count summary like "Read 3 tasks" by counting list lines in the output.
export interface ToolMeta { verb: string; icon: string; destructive?: boolean; noun?: string }

export const TOOL_META: Record<string, ToolMeta> = {
  list_projects:          { verb: "Read projects", icon: "FolderKanban", noun: "project" },
  list_tasks:             { verb: "Read tasks", icon: "ListChecks", noun: "task" },
  search_tasks:           { verb: "Search tasks", icon: "Search", noun: "task" },
  get_task:               { verb: "Read task", icon: "FileText" },
  recent_completed_tasks: { verb: "Read recent", icon: "CheckCheck", noun: "task" },
  create_project:         { verb: "Create project", icon: "FolderPlus" },
  rename_project:         { verb: "Rename project", icon: "Pencil" },
  recolor_project:        { verb: "Recolor project", icon: "Palette" },
  delete_project:         { verb: "Delete project", icon: "Trash2", destructive: true },
  create_task:            { verb: "Create task", icon: "Plus" },
  update_task:            { verb: "Update task", icon: "Pencil" },
  set_task_status:        { verb: "Set status", icon: "CheckCircle2" },
  delete_task:            { verb: "Delete task", icon: "Trash2", destructive: true },
  add_subtasks:           { verb: "Add subtasks", icon: "ListPlus" },
  update_subtask:         { verb: "Update subtask", icon: "Pencil" },
  delete_subtask:         { verb: "Delete subtask", icon: "Trash2", destructive: true },
  create_tag:             { verb: "Create tag", icon: "Tag" },
  delete_tag:             { verb: "Delete tag", icon: "Trash2", destructive: true },
};

export function toolMetaFor(name: string): ToolMeta {
  return TOOL_META[name] ?? { verb: name.replace(/_/g, " "), icon: "Sparkles" };
}
