export type NotificationType = 'info' | 'warning' | 'success' | 'error'

export interface Notification {
  id: string
  userId: string
  title: string
  message: string
  type: NotificationType
  read: boolean
  createdAt: string
}
