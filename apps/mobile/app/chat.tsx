import { useState, useRef, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useMobileChatStore } from '@/stores/mobileChat'
import type { Message } from '@openagents/shared'

export default function ChatScreen() {
  const router = useRouter()
  const { messages, sendMessage, isStreaming, initConversation } = useMobileChatStore()
  const [input, setInput] = useState('')
  const listRef = useRef<FlatList>(null)

  useEffect(() => { initConversation() }, [])
  useEffect(() => {
    if (messages.length > 0) listRef.current?.scrollToEnd({ animated: true })
  }, [messages])

  async function handleSend() {
    const text = input.trim()
    if (!text || isStreaming) return
    setInput('')
    await sendMessage(text)
  }

  function renderMessage({ item }: { item: Message }) {
    const isUser = item.role === 'user'
    const isTool = item.role === 'tool'

    if (isTool) {
      return (
        <View style={styles.toolRow}>
          <Text style={styles.toolText}>{item.content}</Text>
        </View>
      )
    }

    return (
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.agentBubble]}>
        <Text style={styles.bubbleText}>{item.content}</Text>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.topButton} onPress={() => router.push('/channels')}>
            <Text style={styles.topButtonText}>Channels</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.topButton} onPress={() => router.push('/settings')}>
            <Text style={styles.topButtonText}>Settings</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Send a message to get started</Text>
          }
        />

        {/* Approval banners */}
        <ApprovalsSection />

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Message the agent..."
            placeholderTextColor="#555"
            multiline
            editable={!isStreaming}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || isStreaming) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!input.trim() || isStreaming}
          >
            {isStreaming ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.sendBtnText}>↑</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function ApprovalsSection() {
  const { pendingApprovals, approveAction, denyAction } = useMobileChatStore()
  if (!pendingApprovals.length) return null

  return (
    <View style={styles.approvals}>
      {pendingApprovals.map((a) => (
        <View key={a.id} style={styles.approvalBanner}>
          <Text style={styles.approvalTitle}>Action: {a.toolName}</Text>
          <View style={styles.approvalButtons}>
            <TouchableOpacity style={styles.approveBtn} onPress={() => approveAction(a.id)}>
              <Text style={styles.approveBtnText}>Approve</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.denyBtn} onPress={() => denyAction(a.id)}>
              <Text style={styles.denyBtnText}>Deny</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 8,
  },
  topButton: {
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#111827',
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topButtonText: { color: '#cbd5e1', fontSize: 12, fontWeight: '600' },
  messageList: { padding: 16, gap: 12, paddingBottom: 24 },
  bubble: { maxWidth: '80%', padding: 12, borderRadius: 16 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#0ea5e9', borderBottomRightRadius: 4 },
  agentBubble: { alignSelf: 'flex-start', backgroundColor: '#262626', borderBottomLeftRadius: 4 },
  bubbleText: { color: '#fff', fontSize: 15, lineHeight: 22 },
  toolRow: { alignItems: 'center', marginVertical: 4 },
  toolText: { color: '#555', fontSize: 12, fontFamily: 'monospace' },
  emptyText: { color: '#444', textAlign: 'center', marginTop: 100, fontSize: 15 },
  approvals: { paddingHorizontal: 12, paddingBottom: 8 },
  approvalBanner: {
    backgroundColor: '#2d1f00',
    borderColor: '#78350f',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  approvalTitle: { color: '#fbbf24', fontWeight: '600', marginBottom: 8 },
  approvalButtons: { flexDirection: 'row', gap: 8 },
  approveBtn: { flex: 1, backgroundColor: '#15803d', padding: 8, borderRadius: 8, alignItems: 'center' },
  approveBtnText: { color: '#fff', fontWeight: '600' },
  denyBtn: { flex: 1, backgroundColor: '#7f1d1d', padding: 8, borderRadius: 8, alignItems: 'center' },
  denyBtnText: { color: '#fff', fontWeight: '600' },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#262626',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 15,
    maxHeight: 120,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0ea5e9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
})
