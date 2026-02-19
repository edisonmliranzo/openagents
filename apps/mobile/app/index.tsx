import { Redirect } from 'expo-router'
import { useEffect } from 'react'
import { useMobileChatStore } from '../src/stores/mobileChat'

export default function Index() {
  const accessToken = useMobileChatStore((s) => s.accessToken)
  const authLoaded = useMobileChatStore((s) => s.authLoaded)
  const loadAuth = useMobileChatStore((s) => s.loadAuth)

  useEffect(() => {
    void loadAuth()
  }, [loadAuth])

  if (!authLoaded) return null

  return <Redirect href={accessToken ? '/chat' : '/login'} />
}
