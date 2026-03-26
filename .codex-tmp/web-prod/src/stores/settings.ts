import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { sdk } from './auth'
import type { UserSettings } from '@openagents/shared'

interface SettingsState {
  settings: UserSettings | null
  loading: boolean
  load: () => Promise<void>
  update: (data: Partial<Pick<UserSettings, 'preferredProvider' | 'preferredModel' | 'customSystemPrompt'>>) => Promise<void>
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: null,
      loading: false,

      async load() {
        set({ loading: true })
        try {
          const settings = await sdk.users.getSettings()
          set({ settings })
        } finally {
          set({ loading: false })
        }
      },

      async update(data) {
        const updated = await sdk.users.updateSettings(data)
        set({ settings: updated })
      },
    }),
    {
      name: 'openagents-settings',
      partialize: (s) => ({ settings: s.settings }),
    },
  ),
)
