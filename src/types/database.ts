export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          avatar_url: string | null;
          timezone: string;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          avatar_url?: string | null;
          timezone?: string;
          created_at?: string;
        };
        Update: {
          display_name?: string | null;
          avatar_url?: string | null;
          timezone?: string;
        };
        Relationships: [];
      };
      user_settings: {
        Row: {
          user_id: string;
          theme: "dark" | "light" | "system";
          active_wallpaper_id: string | null;
          focus_duration_sec: number;
          short_break_sec: number;
          long_break_sec: number;
          long_break_every: number;
          completion_tone: string;
          dnd_during_focus: boolean;
          browser_notifs_enabled: boolean;
          auto_start_breaks: boolean;
          auto_start_pomodoros: boolean;
          wallpaper_blur: number;
          wallpaper_opacity: number;
        };
        Insert: {
          user_id: string;
          theme?: "dark" | "light" | "system";
          active_wallpaper_id?: string | null;
          focus_duration_sec?: number;
          short_break_sec?: number;
          long_break_sec?: number;
          long_break_every?: number;
          completion_tone?: string;
          dnd_during_focus?: boolean;
          browser_notifs_enabled?: boolean;
          auto_start_breaks?: boolean;
          auto_start_pomodoros?: boolean;
          wallpaper_blur?: number;
          wallpaper_opacity?: number;
        };
        Update: {
          theme?: "dark" | "light" | "system";
          active_wallpaper_id?: string | null;
          focus_duration_sec?: number;
          short_break_sec?: number;
          long_break_sec?: number;
          long_break_every?: number;
          completion_tone?: string;
          dnd_during_focus?: boolean;
          browser_notifs_enabled?: boolean;
          auto_start_breaks?: boolean;
          auto_start_pomodoros?: boolean;
          wallpaper_blur?: number;
          wallpaper_opacity?: number;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          color: string;
          icon: string | null;
          archived_at: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          color?: string;
          icon?: string | null;
          archived_at?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          name?: string;
          color?: string;
          icon?: string | null;
          archived_at?: string | null;
          sort_order?: number;
        };
        Relationships: [];
      };
      tags: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          color: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          color?: string;
          created_at?: string;
        };
        Update: {
          name?: string;
          color?: string;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          user_id: string;
          project_id: string | null;
          title: string;
          notes: string | null;
          priority: "low" | "med" | "high" | "urgent";
          status: "todo" | "done";
          estimated_pomodoros: number;
          completed_pomodoros: number;
          sort_order: number;
          completed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          project_id?: string | null;
          title: string;
          notes?: string | null;
          priority?: "low" | "med" | "high" | "urgent";
          status?: "todo" | "done";
          estimated_pomodoros?: number;
          completed_pomodoros?: number;
          sort_order?: number;
          completed_at?: string | null;
          created_at?: string;
        };
        Update: {
          project_id?: string | null;
          title?: string;
          notes?: string | null;
          priority?: "low" | "med" | "high" | "urgent";
          status?: "todo" | "done";
          estimated_pomodoros?: number;
          completed_pomodoros?: number;
          sort_order?: number;
          completed_at?: string | null;
        };
        Relationships: [];
      };
      task_tags: {
        Row: { task_id: string; tag_id: string };
        Insert: { task_id: string; tag_id: string };
        Update: never;
        Relationships: [];
      };
      focus_sessions: {
        Row: {
          id: string;
          user_id: string;
          task_id: string | null;
          project_id: string | null;
          mode: "pomodoro" | "custom" | "short_break" | "long_break";
          started_at: string;
          ended_at: string | null;
          planned_duration_sec: number;
          actual_duration_sec: number | null;
          completed: boolean;
          interruption_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          task_id?: string | null;
          project_id?: string | null;
          mode: "pomodoro" | "custom" | "short_break" | "long_break";
          started_at?: string;
          ended_at?: string | null;
          planned_duration_sec: number;
          actual_duration_sec?: number | null;
          completed?: boolean;
          interruption_count?: number;
          created_at?: string;
        };
        Update: {
          ended_at?: string | null;
          actual_duration_sec?: number | null;
          completed?: boolean;
          interruption_count?: number;
        };
        Relationships: [];
      };
      wallpapers: {
        Row: {
          id: string;
          user_id: string | null;
          name: string;
          storage_path: string;
          is_builtin: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          name: string;
          storage_path: string;
          is_builtin?: boolean;
          created_at?: string;
        };
        Update: {
          name?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      v_daily_focus: {
        Row: {
          user_id: string;
          day: string;
          total_seconds: number;
          sessions: number;
          completed_sessions: number;
        };
        Relationships: [];
      };
      v_tag_focus: {
        Row: {
          user_id: string;
          tag_id: string;
          tag_name: string;
          tag_color: string;
          total_seconds: number;
        };
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};

/* ─── Convenience aliases ────────────────────────────────────────── */
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type UserSettings = Database["public"]["Tables"]["user_settings"]["Row"];
export type Project = Database["public"]["Tables"]["projects"]["Row"];
export type Tag = Database["public"]["Tables"]["tags"]["Row"];
export type Task = Database["public"]["Tables"]["tasks"]["Row"];
export type TaskTag = Database["public"]["Tables"]["task_tags"]["Row"];
export type FocusSession = Database["public"]["Tables"]["focus_sessions"]["Row"];
export type Wallpaper = Database["public"]["Tables"]["wallpapers"]["Row"];
export type DailyFocus = Database["public"]["Views"]["v_daily_focus"]["Row"];
export type TagFocus = Database["public"]["Views"]["v_tag_focus"]["Row"];

export type TaskWithTags = Task & { tags: Tag[] };
export type ProjectWithTasks = Project & { tasks: TaskWithTags[] };
