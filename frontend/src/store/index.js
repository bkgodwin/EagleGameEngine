import { create } from 'zustand';

export const useStore = create((set) => ({
  user: null,
  setUser: (user) => set({ user }),

  token: null,
  setToken: (token) => set({ token }),

  currentProject: null,
  setCurrentProject: (proj) => set({ currentProject: proj }),

  sceneObjects: [],
  setSceneObjects: (objs) => set({ sceneObjects: objs }),
  addSceneObject: (obj) => set((s) => ({ sceneObjects: [...s.sceneObjects, obj] })),
  removeSceneObject: (id) => set((s) => ({ sceneObjects: s.sceneObjects.filter(o => o.id !== id) })),
  updateSceneObject: (id, updates) => set((s) => ({
    sceneObjects: s.sceneObjects.map(o => o.id === id ? { ...o, ...updates } : o)
  })),

  selectedObjectId: null,
  setSelectedObjectId: (id) => set({ selectedObjectId: id }),

  isPlaying: false,
  setIsPlaying: (v) => set({ isPlaying: v }),

  logs: [],
  addLog: (msg, level = 'info') => set((s) => ({
    logs: [...s.logs, { msg, level, time: new Date().toLocaleTimeString() }].slice(-200)
  })),
  clearLogs: () => set({ logs: [] }),

  settings: {
    renderDistance: 500,
    shadowQuality: 'low',
    textureQuality: 'medium',
    shadowsEnabled: true,
    lightingQuality: 'medium',
  },
  updateSettings: (updates) => set((s) => ({ settings: { ...s.settings, ...updates } })),

  editorMode: 'select',
  setEditorMode: (mode) => set({ editorMode: mode }),

  onlineCount: 0,
  setOnlineCount: (n) => set({ onlineCount: n }),
}));
