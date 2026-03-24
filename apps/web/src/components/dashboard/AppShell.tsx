'use client'

import clsx from 'clsx'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  Bell,
  BookOpen,
  Brain,
  ChevronDown,
  FileText,
  Layers3,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  ScrollText,
  Settings2,
  ShieldCheck,
  Sun,
  Terminal,
  Users,
  X,
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

const BASE_NAV_GROUPS: NavGroup[] = [
  {
    title: 'Assistant',
    items: [
      { label: 'Assistant Core', href: '/agent/openagent', icon: Activity },
      { label: 'Presets', href: '/agent/presets', icon: Layers3 },
      { label: 'Skills', href: '/agent/skills', icon: Brain },
      { label: 'Marketplace', href: '/agent/marketplace', icon: BookOpen },
    ],
  },
  {
    title: 'Work',
    items: [
      { label: 'Tasks', href: '/chat', icon: MessageSquare },
      { label: 'Actions', href: '/approvals', icon: ShieldCheck },
      { label: 'Knowledge', href: '/memory', icon: Brain },
      { label: 'Artifacts', href: '/artifacts', icon: FileText },
      { label: 'Workspaces', href: '/workspaces', icon: Users },
      { label: 'Runs', href: '/sessions', icon: Terminal },
    ],
  },
  {
    title: 'Control',
    items: [
      { label: 'Ops Overview', href: '/control/overview', icon: Activity },
      { label: 'Dry Run', href: '/control/dry-run', icon: Terminal },
      { label: 'Operator Inbox', href: '/control/operator', icon: ShieldCheck },
      { label: 'Provenance', href: '/control/provenance', icon: Brain },
      { label: 'Watchers', href: '/control/watchers', icon: Bell },
      { label: 'Settings', href: '/settings/config', icon: Settings2 },
      { label: 'Audit', href: '/audit', icon: FileText },
      { label: 'System Logs', href: '/settings/logs', icon: ScrollText },
    ],
  },
  {
    title: 'Resources',
    items: [{ label: 'Docs', href: '/docs', icon: BookOpen }],
  },
]

const THEME_STORAGE_KEY = 'openagents.dashboard.theme'

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
    <div className="oa-brand-badge flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white">
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
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const notifRef = useRef<HTMLDivElement | null>(null)
  const profileSyncedRef = useRef(false)
  const isOwnerUser = (user?.role ?? '').toLowerCase() === 'owner'

  const navGroups = useMemo<NavGroup[]>(() => {
    if (!isOwnerUser) return BASE_NAV_GROUPS
    return [
      ...BASE_NAV_GROUPS,
      {
        title: 'Creator',
        items: [{ label: 'Admin', href: '/control/admin', icon: ShieldCheck }],
      },
    ]
  }, [isOwnerUser])

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
      if (stored === 'dark') {
        setTheme('dark')
      }
    } catch {
      // Ignore storage failures and keep light mode.
    }
  }, [])

  useEffect(() => {
    const root = document.documentElement
    const isDark = theme === 'dark'
    root.classList.toggle('theme-dark', isDark)
    root.classList.toggle('dark', isDark)
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // Ignore storage failures.
    }
  }, [theme])

  useEffect(() => {
    if (!hydrated) return
    if (!accessToken) router.replace('/login')
  }, [hydrated, accessToken, router])

  useEffect(() => {
    profileSyncedRef.current = false
  }, [accessToken])

  useEffect(() => {
    if (!hydrated || !accessToken || profileSyncedRef.current) return
    profileSyncedRef.current = true
    if (typeof syncUser === 'function') {
      void syncUser()
    }
  }, [hydrated, accessToken, syncUser])

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

  useEffect(() => {
    setIsMobileNavOpen(false)
  }, [pathname])

  const unreadNotifications = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications],
  )

  const activeRouteLabel =
    navGroups.flatMap((group) => group.items).find((item) => isActivePath(pathname, item.href))
      ?.label ?? 'Dashboard'

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
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
        <div className="flex flex-col items-center gap-4">
          <div className="oa-brand-badge flex h-10 w-10 items-center justify-center rounded-xl">
            <Activity size={20} className="text-white" />
          </div>
          <div className="flex gap-1.5">
            <span className="typing-dot h-2 w-2 rounded-full bg-[var(--accent)]" />
            <span className="typing-dot h-2 w-2 rounded-full bg-[var(--accent)]" />
            <span className="typing-dot h-2 w-2 rounded-full bg-[var(--accent)]" />
          </div>
        </div>
      </div>
    )
  }

  if (!accessToken) return null

  return (
    <div className="dashboard-theme relative min-h-[100dvh]">
      {isMobileNavOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={() => setIsMobileNavOpen(false)}
          className="fixed inset-0 z-40 bg-[var(--overlay)] backdrop-blur-[3px] md:hidden"
        />
      )}

      <div className="mx-auto flex w-full max-w-[1720px]">
        <aside
          className={clsx(
            'fixed inset-y-0 left-0 z-50 flex w-[252px] flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] px-3 py-4 backdrop-blur-2xl transition-transform duration-200 md:static md:z-0 md:translate-x-0',
            isMobileNavOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className="mb-4 flex items-center gap-3 px-2">
            <div className="oa-brand-badge flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold text-white">
              OA
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-[var(--tone-default)] dark:text-[var(--tone-inverse)]">
                OpenAgents
              </p>
              <p className="truncate text-[11px] text-[var(--muted)] dark:text-[var(--muted)]">
                Workspace
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsMobileNavOpen(false)}
              className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-subtle)] md:hidden"
              aria-label="Close sidebar"
            >
              <X size={14} />
            </button>
          </div>

          <nav className="flex-1 space-y-5 overflow-y-auto px-1">
            {navGroups.map((group) => (
              <div key={group.title}>
                <p className="mb-1.5 px-2 text-[11px] font-medium text-[var(--muted)] dark:text-[var(--muted)]">
                  {group.title}
                </p>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const active = isActivePath(pathname, item.href)
                    const Icon = item.icon
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setIsMobileNavOpen(false)}
                        className={clsx(
                          'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] transition',
                          active
                            ? 'oa-brand-badge text-white'
                            : 'text-[var(--tone-default)] hover:bg-[var(--surface-subtle)] dark:text-[var(--tone-inverse)] dark:hover:bg-[var(--surface-subtle)]',
                        )}
                      >
                        <Icon
                          size={14}
                          className={clsx(
                            active ? 'text-white' : 'text-[var(--muted)] dark:text-[var(--muted)]',
                          )}
                        />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2.5 backdrop-blur-xl dark:bg-[var(--surface-muted)]">
            <div className="flex items-center gap-2.5">
              <UserInitials name={user?.name} email={user?.email} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">
                  {user?.name ?? 'User'}
                </p>
                <p className="truncate text-[11px] text-[var(--muted)] dark:text-[var(--muted)]">
                  {user?.email}
                </p>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-[var(--surface-subtle)] hover:text-[var(--tone-strong)] disabled:opacity-50 dark:hover:text-[var(--tone-inverse)]"
                title="Sign out"
              >
                <LogOut size={13} />
              </button>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1 md:ml-0">
          <header className="sticky top-0 z-20 px-3 py-3 sm:px-6">
            <div className="oa-card-elevated rounded-2xl px-3 py-2.5 backdrop-blur sm:px-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsMobileNavOpen(true)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--tone-default)] md:hidden"
                    aria-label="Open sidebar"
                  >
                    <Menu size={16} />
                  </button>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">
                      {activeRouteLabel}
                    </p>
                    <p className="truncate text-xs text-[var(--muted)] dark:text-[var(--muted)]">
                      Personal AI assistant workspace
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                    className="oa-soft-button inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-medium transition dark:text-[var(--tone-inverse)]"
                    aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                    title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  >
                    {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                    <span className="hidden sm:inline">{theme === 'dark' ? 'Light' : 'Dark'}</span>
                  </button>

                  <div className="relative" ref={notifRef}>
                    <button
                      type="button"
                      onClick={() => setIsNotificationsOpen((open) => !open)}
                      className="oa-soft-button relative inline-flex h-9 w-9 items-center justify-center rounded-xl text-[var(--tone-muted)] transition dark:text-[var(--tone-inverse)]"
                      aria-label="Notifications"
                    >
                      <Bell size={15} />
                      {unreadNotifications > 0 && (
                        <span className="oa-brand-badge absolute -right-1 -top-1 min-w-[16px] rounded-full px-1 text-center text-[10px] font-semibold leading-4 text-white">
                          {unreadNotifications > 9 ? '9+' : unreadNotifications}
                        </span>
                      )}
                    </button>

                    {isNotificationsOpen && (
                      <div className="absolute right-0 z-30 mt-2 w-[min(92vw,340px)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xl">
                        <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2.5">
                          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)] dark:text-[var(--muted)]">
                            Notifications
                          </p>
                          <button
                            type="button"
                            onClick={() => void handleMarkAllRead()}
                            className="text-xs font-medium text-[var(--tone-muted)] hover:text-[var(--tone-strong)] dark:text-[var(--muted)] dark:hover:text-[var(--tone-inverse)]"
                          >
                            Mark all read
                          </button>
                        </div>
                        <div className="max-h-[320px] overflow-y-auto">
                          {isNotificationsLoading && notifications.length === 0 && (
                            <p className="px-3 py-4 text-sm text-[var(--muted)] dark:text-[var(--muted)]">
                              Loading...
                            </p>
                          )}
                          {!isNotificationsLoading && notifications.length === 0 && (
                            <p className="px-3 py-4 text-sm text-[var(--muted)] dark:text-[var(--muted)]">
                              No notifications.
                            </p>
                          )}
                          {notifications.map((notification) => (
                            <button
                              key={notification.id}
                              type="button"
                              onClick={() => void handleMarkNotificationRead(notification.id)}
                              className={clsx(
                                'block w-full border-b border-[var(--border)] px-3 py-2.5 text-left transition last:border-b-0',
                                notification.read
                                  ? 'bg-[var(--surface)]'
                                  : 'bg-[var(--surface-muted)] hover:bg-[var(--surface-subtle)]',
                              )}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <p className="text-sm font-semibold text-[var(--tone-strong)] dark:text-[var(--tone-inverse)]">
                                  {notification.title}
                                </p>
                                <p className="text-[11px] text-[var(--tone-soft)] dark:text-[var(--tone-soft)]">
                                  {relativeTime(notification.createdAt)}
                                </p>
                              </div>
                              <p className="mt-1 text-xs text-[var(--muted)] dark:text-[var(--muted)]">
                                {notification.message}
                              </p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="hidden items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] py-1 pl-1 pr-2.5 text-[12px] font-medium text-[var(--tone-default)] sm:flex dark:text-[var(--tone-inverse)]">
                    <UserInitials name={user?.name} email={user?.email} />
                    <span className="hidden max-w-[120px] truncate sm:block">
                      {user?.name ?? user?.email ?? 'User'}
                    </span>
                    <ChevronDown
                      size={12}
                      className="text-[var(--tone-soft)] dark:text-[var(--tone-soft)]"
                    />
                  </div>
                </div>
              </div>
            </div>
          </header>

          <main className="px-2 py-3 sm:px-6 sm:py-6">{children}</main>
        </div>
      </div>
    </div>
  )
}
