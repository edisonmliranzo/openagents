import { create } from 'zustand'

interface CanvasState {
  open: boolean
  artifactId: string | null
  width: number
  openArtifact: (id: string) => void
  close: () => void
  setWidth: (width: number) => void
}

export const useCanvasStore = create<CanvasState>()((set) => ({
  open: false,
  artifactId: null,
  width: 560,
  openArtifact: (id) => set({ open: true, artifactId: id }),
  close: () => set({ open: false }),
  setWidth: (width) => set({ width: Math.min(Math.max(width, 320), 1200) }),
}))

/** Convenience for non-React callers (e.g. message renderers). */
export const openArtifact = (id: string) => useCanvasStore.getState().openArtifact(id)
