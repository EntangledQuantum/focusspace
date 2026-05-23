import { create } from "zustand";

interface MiniPlayerState {
  pipWindow: Window | null;
  setPipWindow: (w: Window | null) => void;
}

/**
 * Holds the active Document PiP window globally so the portal host
 * (in app layout) keeps rendering across route changes.
 */
export const useMiniPlayerStore = create<MiniPlayerState>((set) => ({
  pipWindow: null,
  setPipWindow: (w) => set({ pipWindow: w }),
}));
