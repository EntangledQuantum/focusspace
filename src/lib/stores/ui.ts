import { create } from "zustand";

interface UiState {
  /** Focus mode hides the dock + nav for a distraction-free timer */
  focusMode: boolean;
  wallpaperPreviewId: string | null;
  taskPickerOpen: boolean;
  activeProjectId: string | null;

  setFocusMode: (v: boolean) => void;
  setWallpaperPreview: (id: string | null) => void;
  setTaskPickerOpen: (v: boolean) => void;
  setActiveProjectId: (id: string | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  focusMode: false,
  wallpaperPreviewId: null,
  taskPickerOpen: false,
  activeProjectId: null,

  setFocusMode: (v) => set({ focusMode: v }),
  setWallpaperPreview: (id) => set({ wallpaperPreviewId: id }),
  setTaskPickerOpen: (v) => set({ taskPickerOpen: v }),
  setActiveProjectId: (id) => set({ activeProjectId: id }),
}));
