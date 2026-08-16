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
  focus_stats:            { verb: "Read focus stats", icon: "BarChart3" },
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
  get_workspace_state:    { verb: "Read workspace", icon: "Radar" },
  reset_task_progress:    { verb: "Reset task", icon: "RotateCcw" },
  get_settings:           { verb: "Read settings", icon: "Settings" },
  update_settings:        { verb: "Update settings", icon: "SlidersHorizontal" },
  start_timer:            { verb: "Start timer", icon: "Play" },
  pause_timer:            { verb: "Pause timer", icon: "Pause" },
  resume_timer:           { verb: "Resume timer", icon: "Play" },
  skip_timer:             { verb: "Skip session", icon: "SkipForward" },
  reset_timer:            { verb: "Reset timer", icon: "RotateCcw" },
  set_active_task:        { verb: "Select task", icon: "Target" },
  confirm_action:         { verb: "Confirm delete", icon: "Check", destructive: true },
  analytics_overview:     { verb: "Read overview", icon: "BarChart3" },
  analytics_by_project:   { verb: "Read by project", icon: "FolderKanban" },
  analytics_by_tag:       { verb: "Read by tag", icon: "Tag" },
  analytics_heatmap:      { verb: "Read heatmap", icon: "Calendar" },
  analytics_sessions:     { verb: "Read sessions", icon: "List" },
  analytics_compare:      { verb: "Compare periods", icon: "GitCompare" },
  now_playing:            { verb: "Now playing", icon: "Disc3" },
  search_music:           { verb: "Search music", icon: "Search" },
  play_music:             { verb: "Play music", icon: "Play" },
  pause_music:            { verb: "Pause music", icon: "Pause" },
  resume_music:           { verb: "Resume music", icon: "Play" },
  next_track:             { verb: "Next track", icon: "SkipForward" },
  previous_track:         { verb: "Previous track", icon: "SkipBack" },
  set_volume:             { verb: "Set volume", icon: "Volume2" },
  set_shuffle:            { verb: "Set shuffle", icon: "Shuffle" },
};

export function toolMetaFor(name: string): ToolMeta {
  return TOOL_META[name] ?? { verb: name.replace(/_/g, " "), icon: "Sparkles" };
}
