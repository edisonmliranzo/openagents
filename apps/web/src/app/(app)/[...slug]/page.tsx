import { redirect } from 'next/navigation'

interface PlaceholderPageProps {
  params: { slug?: string[] }
}

// Auth routes that must never be caught by this (app) catch-all
const AUTH_SLUGS = new Set(['login', 'register'])

function formatSectionName(slug: string[]) {
  return slug
    .join(' / ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export default function PlaceholderPage({ params }: PlaceholderPageProps) {
  const slug = params.slug ?? []

  // If someone lands here with an auth slug, send them to login immediately
  if (slug.length === 1 && AUTH_SLUGS.has(slug[0])) {
    redirect('/login')
  }

  const title = slug.length ? formatSectionName(slug) : 'Dashboard'

  return (
    <div className="mx-auto max-w-[1200px] space-y-4">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">This panel is scaffolded and ready for feature wiring.</p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm text-slate-600">
          This route is part of the OpenClaw-style dashboard shell. Tell me which controls you want here next and I
          will wire the data and actions.
        </p>
      </section>
    </div>
  )
}
