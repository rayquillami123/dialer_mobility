import { create } from 'zustand';

type SidebarState = {
  activeSection: string;
  setActiveSection: (section: string) => void;
};

export const useSidebarStore = create<SidebarState>((set) => ({
  activeSection: 'dashboard',
  setActiveSection: (section) => set({ activeSection: section }),
}));
