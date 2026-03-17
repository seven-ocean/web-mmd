import { create } from "zustand"

type AihumanControlState = {
  speaking: boolean
  speak: (() => Promise<void>) | null
  stop: (() => void) | null
  setSpeaking: (speaking: boolean) => void
  setActions: (actions: { speak: () => Promise<void>; stop: () => void }) => void
  clearActions: () => void
}

const useAihumanControlStore = create<AihumanControlState>((set) => ({
  speaking: false,
  speak: null,
  stop: null,
  setSpeaking: (speaking) => set({ speaking }),
  setActions: ({ speak, stop }) => set({ speak, stop }),
  clearActions: () => set({ speak: null, stop: null, speaking: false }),
}))

export default useAihumanControlStore

