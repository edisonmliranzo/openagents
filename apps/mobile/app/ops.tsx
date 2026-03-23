import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { Approval, MissionControlEvent, Notification } from '@openagents/shared'
import { mobileSdk } from '../src/stores/mobileChat'

function timeAgo(isoDate: string) {
  const ts = new Date(isoDate).getTime()
  if (!Number.isFinite(ts)) return 'n/a'
  const deltaMin = Math.max(0, Math.floor((Date.now() - ts) / 60000))
  if (deltaMin < 1) return 'just now'
  if (deltaMin < 60) return `${deltaMin}m ago`
  const deltaHours = Math.floor(deltaMin / 60)
  if (deltaHours < 24) return `${deltaHours}h ago`
  return `${Math.floor(deltaHours / 24)}d ago`
}

export default function OpsScreen() {
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [events, setEvents] = useState<MissionControlEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [actingApprovalId, setActingApprovalId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const [pendingApprovals, inbox, mission] = await Promise.all([
        mobileSdk.approvals.list('pending'),
        mobileSdk.notifications.list(),
        mobileSdk.missionControl.listEvents({ limit: 20 }),
      ])
      setApprovals(pendingApprovals)
      setNotifications(inbox)
      setEvents(mission.events)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load ops data')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  async function resolveApproval(approvalId: string, approved: boolean) {
    setActingApprovalId(approvalId)
    setError('')
    try {
      if (approved) {
        await mobileSdk.approvals.approve(approvalId)
      } else {
        await mobileSdk.approvals.deny(approvalId)
      }
      setApprovals((current) => current.filter((approval) => approval.id !== approvalId))
    } catch (err: any) {
      setError(err?.message ?? 'Failed to resolve approval')
    } finally {
      setActingApprovalId(null)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => void loadData()} tintColor="#fff" />}
      >
        <View style={styles.summaryRow}>
          <SummaryCard label="Pending Approvals" value={String(approvals.length)} />
          <SummaryCard label="Unread Alerts" value={String(notifications.filter((item) => !item.read).length)} />
          <SummaryCard label="Recent Events" value={String(events.length)} />
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>Approvals</Text>
          {isLoading && approvals.length === 0 ? <ActivityIndicator color="#fff" /> : null}
          {approvals.length === 0 ? <Text style={styles.emptyText}>No pending approvals.</Text> : null}
          {approvals.map((approval) => (
            <View key={approval.id} style={styles.item}>
              <Text style={styles.itemTitle}>{approval.toolName}</Text>
              <Text style={styles.itemMeta}>{approval.risk?.level ?? 'unknown'} risk</Text>
              <Text style={styles.itemBody}>{approval.toolInputPreview ?? 'No preview available.'}</Text>
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.approveButton, actingApprovalId === approval.id && styles.disabledButton]}
                  disabled={actingApprovalId === approval.id}
                  onPress={() => void resolveApproval(approval.id, true)}
                >
                  <Text style={styles.actionText}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.denyButton, actingApprovalId === approval.id && styles.disabledButton]}
                  disabled={actingApprovalId === approval.id}
                  onPress={() => void resolveApproval(approval.id, false)}
                >
                  <Text style={styles.actionText}>Deny</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>Notifications</Text>
          {notifications.length === 0 ? <Text style={styles.emptyText}>No notifications.</Text> : null}
          {notifications.slice(0, 10).map((notification) => (
            <View key={notification.id} style={styles.item}>
              <Text style={styles.itemTitle}>{notification.title}</Text>
              <Text style={styles.itemMeta}>
                {notification.type} · {timeAgo(notification.createdAt)}
              </Text>
              <Text style={styles.itemBody}>{notification.message}</Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>Mission Events</Text>
          {events.length === 0 ? <Text style={styles.emptyText}>No recent events.</Text> : null}
          {events.map((event) => (
            <View key={event.id} style={styles.item}>
              <Text style={styles.itemTitle}>{event.type}</Text>
              <Text style={styles.itemMeta}>
                {event.status} · {timeAgo(event.createdAt)}
              </Text>
              <Text style={styles.itemBody}>{event.source}</Text>
            </View>
          ))}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  content: { padding: 16, gap: 12 },
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#111827',
    padding: 12,
  },
  summaryLabel: { color: '#94a3b8', fontSize: 11, textTransform: 'uppercase' },
  summaryValue: { color: '#f8fafc', fontSize: 24, fontWeight: '700', marginTop: 6 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#111827',
    padding: 12,
    gap: 10,
  },
  heading: { color: '#f8fafc', fontSize: 16, fontWeight: '700' },
  item: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0b1220',
    padding: 10,
    gap: 4,
  },
  itemTitle: { color: '#f8fafc', fontSize: 14, fontWeight: '600' },
  itemMeta: { color: '#94a3b8', fontSize: 11 },
  itemBody: { color: '#cbd5e1', fontSize: 12, lineHeight: 18 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  approveButton: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#15803d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  denyButton: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#7f1d1d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  disabledButton: { opacity: 0.5 },
  emptyText: { color: '#64748b', fontSize: 12 },
  error: { color: '#fca5a5', fontSize: 12, textAlign: 'center' },
})
