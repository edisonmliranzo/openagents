import { AppShell } from '@/components/dashboard/AppShell'
import { ToastContainer } from '@/components/ui/Toast'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppShell>{children}</AppShell>
      <ToastContainer />
    </>
  )
}
