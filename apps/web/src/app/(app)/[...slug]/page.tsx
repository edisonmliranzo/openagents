import { notFound, redirect } from 'next/navigation'

interface CatchAllPageProps {
  params: { slug?: string[] }
}

// Auth routes that must never be caught by this (app) catch-all
const AUTH_SLUGS = new Set(['login', 'register'])

export function generateStaticParams() {
  return [{ slug: ['__not-found__'] }]
}

export default function CatchAllPage({ params }: CatchAllPageProps) {
  const slug = params.slug ?? []

  if (slug.length === 1 && AUTH_SLUGS.has(slug[0])) {
    redirect('/login')
  }

  notFound()
}
