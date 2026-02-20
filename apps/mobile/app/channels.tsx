import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import {
  type WhatsAppChannelHealth,
  type WhatsAppDeviceLink,
  type WhatsAppPairingSession,
} from '@openagents/shared'
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

function timeUntil(isoDate: string) {
  const ts = new Date(isoDate).getTime()
  if (!Number.isFinite(ts)) return 'n/a'
  const deltaMin = Math.floor((ts - Date.now()) / 60000)
  if (deltaMin <= 0) return 'expired'
  if (deltaMin < 60) return `${deltaMin}m`
  const deltaHours = Math.floor(deltaMin / 60)
  if (deltaHours < 24) return `${deltaHours}h`
  return `${Math.floor(deltaHours / 24)}d`
}

export default function ChannelsScreen() {
  const [health, setHealth] = useState<WhatsAppChannelHealth | null>(null)
  const [pairings, setPairings] = useState<WhatsAppPairingSession[]>([])
  const [devices, setDevices] = useState<WhatsAppDeviceLink[]>([])
  const [expiryMinutes, setExpiryMinutes] = useState('15')
  const [isLoading, setIsLoading] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const [nextHealth, nextPairings, nextDevices] = await Promise.all([
        mobileSdk.channels.whatsappHealth(),
        mobileSdk.channels.listWhatsAppPairings(),
        mobileSdk.channels.listWhatsAppDevices(),
      ])
      setHealth(nextHealth)
      setPairings(nextPairings)
      setDevices(nextDevices)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load channels')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const activePairing = pairings.find((pairing) => pairing.status === 'pending') ?? pairings[0] ?? null

  async function handleCreatePairing() {
    setIsCreating(true)
    setError('')
    try {
      const value = Number.parseInt(expiryMinutes, 10)
      const pairing = await mobileSdk.channels.createWhatsAppPairing({
        expiresInMinutes: Number.isFinite(value) ? value : 15,
      })
      setPairings((current) => [pairing, ...current.filter((item) => item.id !== pairing.id)])
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create pairing')
    } finally {
      setIsCreating(false)
    }
  }

  async function handleUnlink(deviceId: string) {
    setUnlinkingId(deviceId)
    setError('')
    try {
      await mobileSdk.channels.unlinkWhatsAppDevice(deviceId)
      setDevices((current) => current.filter((item) => item.id !== deviceId))
    } catch (err: any) {
      setError(err?.message ?? 'Failed to unlink device')
    } finally {
      setUnlinkingId(null)
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.heading}>WhatsApp Pairing</Text>
        <Text style={styles.subtle}>
          Generate a one-time code then send it in WhatsApp to link this phone/device.
        </Text>
        <Text style={styles.meta}>status: {health?.twilioConfigured ? 'enabled' : 'planned'}</Text>

        <View style={styles.pairRow}>
          <TextInput
            value={expiryMinutes}
            onChangeText={setExpiryMinutes}
            keyboardType="numeric"
            style={styles.expiryInput}
            placeholder="15"
            placeholderTextColor="#94a3b8"
          />
          <TouchableOpacity
            style={[styles.primaryButton, (!health?.twilioConfigured || isCreating) && styles.disabledButton]}
            disabled={!health?.twilioConfigured || isCreating}
            onPress={() => void handleCreatePairing()}
          >
            {isCreating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryButtonText}>Generate Pair Link</Text>}
          </TouchableOpacity>
        </View>

        {activePairing && (
          <View style={styles.pairingBox}>
            <Text style={styles.code}>code: {activePairing.code}</Text>
            <Text style={styles.command}>{activePairing.command}</Text>
            <Text style={styles.meta}>status {activePairing.status} | expires {timeUntil(activePairing.expiresAt)}</Text>
            <TouchableOpacity
              style={[styles.secondaryButton, !activePairing.linkUrl && styles.disabledButton]}
              disabled={!activePairing.linkUrl}
              onPress={() => {
                if (!activePairing.linkUrl) return
                void Linking.openURL(activePairing.linkUrl)
              }}
            >
              <Text style={styles.secondaryButtonText}>Open WhatsApp Link</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.heading}>Linked Devices</Text>
        {devices.length === 0 && <Text style={styles.subtle}>No linked devices yet.</Text>}
        {devices.map((device) => (
          <View key={device.id} style={styles.deviceItem}>
            <View style={styles.deviceInfo}>
              <Text style={styles.deviceTitle}>{device.label ?? device.phone}</Text>
              <Text style={styles.devicePhone}>{device.phone}</Text>
              <Text style={styles.meta}>
                linked {timeAgo(device.linkedAt)} | seen {device.lastSeenAt ? timeAgo(device.lastSeenAt) : 'n/a'}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.unlinkButton, unlinkingId === device.id && styles.disabledButton]}
              disabled={unlinkingId === device.id}
              onPress={() => void handleUnlink(device.id)}
            >
              <Text style={styles.unlinkButtonText}>{unlinkingId === device.id ? '...' : 'Unlink'}</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TouchableOpacity style={styles.refreshButton} disabled={isLoading} onPress={() => void loadData()}>
        <Text style={styles.refreshButtonText}>{isLoading ? 'Refreshing...' : 'Refresh'}</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
    backgroundColor: '#0f0f0f',
    minHeight: '100%',
  },
  card: {
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 14,
    padding: 12,
    backgroundColor: '#111827',
    gap: 8,
  },
  heading: {
    color: '#e2e8f0',
    fontSize: 16,
    fontWeight: '700',
  },
  subtle: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
  },
  meta: {
    color: '#64748b',
    fontSize: 11,
  },
  pairRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  expiryInput: {
    width: 72,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    color: '#e2e8f0',
    paddingHorizontal: 10,
  },
  primaryButton: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  pairingBox: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#0b1220',
    gap: 5,
  },
  code: {
    color: '#f8fafc',
    fontWeight: '700',
    fontSize: 13,
  },
  command: {
    color: '#94a3b8',
    fontFamily: 'monospace',
    fontSize: 11,
  },
  secondaryButton: {
    marginTop: 4,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
  deviceItem: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#0b1220',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    alignItems: 'center',
  },
  deviceInfo: {
    flex: 1,
    gap: 2,
  },
  deviceTitle: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
  },
  devicePhone: {
    color: '#94a3b8',
    fontFamily: 'monospace',
    fontSize: 11,
  },
  unlinkButton: {
    width: 76,
    height: 34,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#b91c1c',
    backgroundColor: '#450a0a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unlinkButtonText: {
    color: '#fca5a5',
    fontSize: 12,
    fontWeight: '700',
  },
  error: {
    color: '#fca5a5',
    fontSize: 12,
  },
  refreshButton: {
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0b1220',
  },
  refreshButtonText: {
    color: '#cbd5e1',
    fontWeight: '600',
  },
})

