import { create } from "zustand";

interface UiState {
  sidebarCollapsed: boolean;
  wallpaperPreviewId: string | null;
  taskPickerOpen: boolean;
  activeProjectId: string | null;

  setSidebarCollapsed: (v: boolean) => void;
  toggleSidebar: () => void;
  setWallpaperPreview: (id: string | null) => void;
  setTaskPickerOpen: (v: boolean) => void;
  setActiveProjectId: (id: string | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  wallpaperPreviewId: null,
  taskPickerOpen: false,
  activeProjectId: null,

  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setWallpaperPreview: (id) => set({ wallpaperPreviewId: id }),
  setTaskPickerOpen: (v) => set({ taskPickerOpen: v }),
  setActiveProjectId: (id) => set({ activeProjectId: id }),
}));
