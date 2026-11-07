import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — OpenAgents Personal AI Agent Platform',
  description:
    'Read the OpenAgents Privacy Policy: AES-256-GCM encrypted BYOK & APIsRouter.dev keys, zero model training on your conversations, voice call privacy, and full data export & deletion rights.',
  openGraph: {
    title: 'Privacy Policy — OpenAgents Personal AI Agent Platform',
    description:
      'AES-256-GCM encrypted API keys, zero prompt training retention, local-first memory controls, and GDPR/CCPA data rights.',
    images: ['/og-image.png'],
  },
}

export default function PrivacyPolicyLayout({ children }: { children: React.ReactNode }) {
  return children
}
