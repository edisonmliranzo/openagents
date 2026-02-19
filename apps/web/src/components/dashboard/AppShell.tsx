'use client'

import clsx from 'clsx'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  BarChart2,
  Bell,
  BookOpen,
  Bot,
  Brain,
  Bug,
  ChevronDown,
  Clock,
  FileText,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Network,
  Plug,
  ScrollText,
  Server,
  Settings2,
  ShieldCheck,
  Terminal,
  Zap,
} from 'lucide-react'
import { sdk, useAuthStore } from '@/stores/auth'
import type { Notification } from '@openagents/shared'

interface AppShellProps {
  children: React.ReactNode
}

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Workspace',
    items: [
      { label: 'Chat', href: '/chat', icon: MessageSquare },
      { label: 'Approvals', href: '/approvals', icon: ShieldCheck },
      { label: 'Memory', href: '/memory', icon: Brain },
    ],
  },
  {
    title: 'Control',
    items: [
      { label: 'Overview', href: '/control/overview', icon: LayoutDashboard },
      { label: 'Channels', href: '/control/channels', icon: Plug },
      { label: 'Instances', href: '/control/instances', icon: Server },
      { label: 'Sessions', href: '/sessions', icon: Terminal },
      { label: 'Usage', href: '/control/usage', icon: BarChart2 },
      { label: 'Cron Jobs', href: '/control/cron-jobs', icon: Clock },
    ],
  },
  {
    title: 'Agent',
    items: [
      { label: 'Agents', href: '/agent/agents', icon: Bot },
      { label: 'Skills', href: '/agent/skills', icon: Zap },
      { label: 'Nodes', href: '/agent/nodes', icon: Network },
    ],
  },
  {
    title: 'Settings',
    items: [
      { label: 'Config', href: '/settings/config', icon: Settings2 },
      { label: 'Audit Log', href: '/audit', icon: FileText },
      { label: 'Debug', href: '/settings/debug', icon: Bug },
      { label: 'Logs', href: '/settings/logs', icon: ScrollText },
    ],
  },
  {
    title: 'Resources',
    items: [{ label: 'Docs', href: '/docs', icon: BookOpen }],
  },
]

function isActivePath(current: string, href: string) {
  if (href === '/') return current === href
  return current === href || current.startsWith(`${href}/`)
}

function UserInitials({ name, email }: { name?: string | null; email?: string | null }) {
  const value = name ?? email ?? '?'
  const parts = value.split(/[\s@.]/).filter(Boolean)
  const initials =
    parts.length >= 2
      ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
      : value.slice(0, 2).toUpperCase()

  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-orange-500 text-xs font-bold text-white shadow-glow-red">
      {initials}
    </div>
  )
}

function relativeTime(iso: string) {
  const ts = new Date(iso).getTime()
  if (!Number.isFinite(ts)) return 'n/a'
  const deltaMin = Math.max(0, Math.floor((Date.now() - ts) / 60000))
  if (deltaMin < 1) return 'just now'
  if (deltaMin < 60) return `${deltaMin}m ago`
  const deltaHours = Math.floor(deltaMin / 60)
  if (deltaHours < 24) return `${deltaHours}h ago`
  return `${Math.floor(deltaHours / 24)}d ago`
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const hydrated = useAuthStore((s) => s.hydrated)
  const user = useAuthStore((s) => s.user)
  const accessToken = useAuthStore((s) => s.accessToken)
  const syncUser = useAuthStore((s) => s.syncUser)
  const logout = useAuthStore((s) => s.logout)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [isNotificationsLoading, setIsNotificationsLoading] = useState(false)
  const notifRef = useRef<HTMLDivElement | null>(null)
  const profileSyncedRef = useRef(false)

  useEffect(() => {
    if (!hydrated) return
    if (!accessToken) router.replace('/login')
  }, [hydrated, accessToken, router])

  useEffect(() => {
    if (!hydrated || !accessToken || user || profileSyncedRef.current) return
    profileSyncedRef.current = true
    if (typeof syncUser === 'function') {
      void syncUser()
    }
  }, [hydrated, accessToken, user, syncUser])

  const loadNotifications = useCallback(async () => {
    if (!accessToken) return
    setIsNotificationsLoading(true)
    try {
      const list = await sdk.notifications.list()
      setNotifications(list)
    } finally {
      setIsNotificationsLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    if (!hydrated || !accessToken) return
    void loadNotifications()

    const id = window.setInterval(() => {
      void loadNotifications()
    }, 60_000)

    return () => window.clearInterval(id)
  }, [hydrated, accessToken, loadNotifications])

  useEffect(() => {
    if (!isNotificationsOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (!notifRef.current) return
      if (!notifRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [isNotificationsOpen])

  const unreadNotifications = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications],
  )

  const activeRouteLabel =
    NAV_GROUPS.flatMap((group) => group.items).find((item) => isActivePath(pathname, item.href))?.label ??
    'Dashboard'

  async function handleSignOut() {
    if (typeof logout !== 'function') return
    if (isSigningOut) return
    setIsSigningOut(true)
    try {
      await logout()
      router.push('/login')
    } finally {
      setIsSigningOut(false)
    }
  }

  async function handleMarkNotificationRead(id: string) {
    setNotifications((prev) =>
      prev.map((notification) =>
        notification.id === id ? { ...notification, read: true } : notification,
      ),
    )
    try {
      await sdk.notifications.markRead(id)
    } catch {
      // Keep optimistic update for smoother UX.
    }
  }

  async function handleMarkAllRead() {
    setNotifications((prev) => prev.map((notification) => ({ ...notification, read: true })))
    try {
      await sdk.notifications.markAllRead()
    } catch {
      // Keep optimistic update for smoother UX.
    }
  }

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0f1e]">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-orange-500 shadow-glow-red">
            <Activity size={20} className="text-white" />
          </div>
          <div className="flex gap-1.5">
            <span className="typing-dot h-2 w-2 rounded-full bg-slate-500" />
            <span className="typing-dot h-2 w-2 rounded-full bg-slate-500" />
            <span className="typing-dot h-2 w-2 rounded-full bg-slate-500" />
          </div>
        </div>
      </div>
    )
  }

  if (!accessToken) return null

  return (
    <div className="flex min-h-screen">
      <aside
        className="sidebar-scroll fixed left-0 top-0 z-30 flex h-screen w-[220px] shrink-0 flex-col overflow-y-auto"
        style={{
          background: 'linear-gradient(180deg, #0d1117 0%, #0b0f1e 100%)',
          borderRight: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div className="flex h-14 shrink-0 items-center gap-3 px-5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-orange-500 shadow-glow-sm">
            <span className="text-xs font-black text-white">OA</span>
          </div>
          <div>
            <p className="text-[11px] font-black tracking-[0.12em] text-white">OPENAGENTS</p>
            <p className="text-[9px] font-medium tracking-widest text-slate-500">GATEWAY</p>
          </div>
        </div>

        <div className="mx-4 mb-3 h-px bg-white/5" />

        <nav className="flex-1 space-y-5 px-3 pb-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="mb-1.5 px-3 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                {group.title}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActivePath(pathname, item.href)
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={clsx(
                        'group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150',
                        active ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/6 hover:text-slate-200',
                      )}
                    >
                      <Icon
                        size={14}
                        className={clsx(
                          'shrink-0 transition-colors',
                          active ? 'text-rose-400' : 'text-slate-500 group-hover:text-slate-300',
                        )}
                      />
                      <span className="truncate">{item.label}</span>
                      {active && <div className="ml-auto h-1.5 w-1.5 rounded-full bg-rose-500" />}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 p-3">
          <div
            className="flex items-center gap-2.5 rounded-xl px-2.5 py-2"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            <UserInitials name={user?.name} email={user?.email} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold text-slate-200">{user?.name ?? 'User'}</p>
              <p className="truncate text-[10px] text-slate-500">{user?.email}</p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={isSigningOut}
              title="Sign out"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-500 transition hover:bg-white/10 hover:text-rose-400 disabled:opacity-40"
            >
              <LogOut size={12} />
            </button>
          </div>
        </div>
      </aside>

      <div className="ml-[220px] flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200/80 bg-white/90 px-6 backdrop-blur-xl">
          <div className="flex items-center gap-2 text-[13px]">
            <span className="font-semibold text-slate-800">{activeRouteLabel}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 sm:flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              Live
            </span>

            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => setIsNotificationsOpen((open) => !open)}
                className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                aria-label="Notifications"
              >
                <Bell size={15} />
                {unreadNotifications > 0 && (
                  <span className="absolute -right-1 -top-1 min-w-[16px] rounded-full bg-rose-500 px-1 text-center text-[10px] font-semibold leading-4 text-white">
                    {unreadNotifications > 9 ? '9+' : unreadNotifications}
                  </span>
                )}
              </button>

              {isNotificationsOpen && (
                <div className="absolute right-0 z-30 mt-2 w-[320px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card-hover">
                  <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notifications</p>
                    <button
                      type="button"
                      onClick={() => void handleMarkAllRead()}
                      className="text-xs font-medium text-slate-500 hover:text-slate-700"
                    >
                      Mark all read
                    </button>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto">
                    {isNotificationsLoading && notifications.length === 0 && (
                      <p className="px-3 py-4 text-sm text-slate-500">Loading...</p>
                    )}
                    {!isNotificationsLoading && notifications.length === 0 && (
                      <p className="px-3 py-4 text-sm text-slate-500">No notifications.</p>
                    )}
                    {notifications.map((notification) => (
                      <button
                        key={notification.id}
                        type="button"
                        onClick={() => void handleMarkNotificationRead(notification.id)}
                        className={clsx(
                          'block w-full border-b border-slate-100 px-3 py-2 text-left transition last:border-b-0',
                          notification.read ? 'bg-white' : 'bg-rose-50/40 hover:bg-rose-50/70',
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-800">{notification.title}</p>
                          <p className="text-[11px] text-slate-400">{relativeTime(notification.createdAt)}</p>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{notification.message}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 py-1 pl-1 pr-2.5 text-[12px] font-medium text-slate-700">
              <UserInitials name={user?.name} email={user?.email} />
              <span className="hidden max-w-[120px] truncate sm:block">
                {user?.name ?? user?.email ?? 'User'}
              </span>
              <ChevronDown size={12} className="text-slate-400" />
            </div>
          </div>
        </header>

        <main className="flex-1 animate-fade-in p-6">{children}</main>
      </div>
    </div>
  )
}
