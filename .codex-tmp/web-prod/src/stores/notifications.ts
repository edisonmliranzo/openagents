import { create } from 'zustand'
import { sdk } from './auth'
import type { Notification } from '@openagents/shared'

interface NotificationsState {
  notifications: Notification[]
  unreadCount: number
  loading: boolean
  load: () => Promise<void>
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
}

export const useNotificationsStore = create<NotificationsState>()((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,

  async load() {
    set({ loading: true })
    try {
      const notifications = await sdk.notifications.list()
      set({
        notifications,
        unreadCount: notifications.filter((n) => !n.read).length,
      })
    } finally {
      set({ loading: false })
    }
  },

  async markRead(id) {
    await sdk.notifications.markRead(id)
    set((s) => {
      const notifications = s.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n,
      )
      return { notifications, unreadCount: notifications.filter((n) => !n.read).length }
    })
  },

  async markAllRead() {
    await sdk.notifications.markAllRead()
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }))
  },
}))
