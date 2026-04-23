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

  selectedObjectIds: [],
  setSelectedObjectIds: (ids) => set({ selectedObjectIds: ids }),

  isPlaying: false,
  setIsPlaying: (v) => set({ isPlaying: v }),

  logs: [],
  addLog: (msg, level = 'info') => set((s) => ({
    logs: [...s.logs, { msg, level, time: new Date().toLocaleTimeString() }].slice(-200)
  })),
  clearLogs: () => set({ logs: [] }),

  consoleCollapsed: false,
  setConsoleCollapsed: (v) => set({ consoleCollapsed: v }),

  settings: {
    renderDistance: 500,
    shadowQuality: 'low',
    textureQuality: 'medium',
    shadowsEnabled: true,
    lightingQuality: 'medium',
  },
  updateSettings: (updates) => set((s) => ({ settings: { ...s.settings, ...updates } })),

  snapSettings: {
    enabled: false,
    translate: 0.5,
    rotate: 15,
    scale: 0.25,
  },
  updateSnapSettings: (updates) => set((s) => ({ snapSettings: { ...s.snapSettings, ...updates } })),

  globalLighting: {
    sunColor: '#ffffff',
    sunIntensity: 1.0,
    sunX: 50,
    sunY: 80,
    sunZ: 30,
    ambientColor: '#404060',
    ambientIntensity: 0.5,
  },
  updateGlobalLighting: (updates) => set((s) => ({ globalLighting: { ...s.globalLighting, ...updates } })),

  projectSettings: {
    pvpDamage: true,
    weaponDamage: 25,
    aiAttackDamage: 10,
    aiHealth: 100,
    maxPlayers: 8,
  },
  updateProjectSettings: (updates) => set((s) => ({ projectSettings: { ...s.projectSettings, ...updates } })),

  editorMode: 'select',
  setEditorMode: (mode) => set({ editorMode: mode }),

  onlineCount: 0,
  setOnlineCount: (n) => set({ onlineCount: n }),
}));
