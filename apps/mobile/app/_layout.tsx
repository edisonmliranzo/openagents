import { Stack } from 'expo-router'

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#0f0f0f' },
        headerTintColor: '#fff',
        contentStyle: { backgroundColor: '#0f0f0f' },
      }}
    />
  )
}
