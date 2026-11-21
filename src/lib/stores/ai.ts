import { create } from "zustand";

// Global AI panel state: one chat window for every tab. Pages can open it and
// attach cheap context (e.g. the project the user is looking at).
interface AIPanelState {
  open: boolean;
  /** Set on first open — the lazy panel bundle is only mounted after that. */
  opened: boolean;
  /** Project the current page is focused on, sent to the agent as a hint. */
  projectId: string | null;
  openPanel: (ctx?: { projectId?: string | null }) => void;
  close: () => void;
  toggle: () => void;
}

export const useAIPanel = create<AIPanelState>((set) => ({
  open: false,
  opened: false,
  projectId: null,
  openPanel: (ctx) => set((s) => ({ open: true, opened: true, projectId: ctx && "projectId" in ctx ? ctx.projectId ?? null : s.projectId })),
  close: () => set({ open: false }),
  toggle: () => set((s) => ({ open: !s.open, opened: true })),
}));
