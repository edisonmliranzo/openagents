import { useState, useEffect } from 'react'
import { sdk } from '@/stores/auth'

interface Props {
  sessionId: string
  url: string
  status: 'initializing' | 'active' | 'closed' | 'error'
  lastScreenshot?: string
}

export function BrowserPreview({ sessionId, url, status, lastScreenshot }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [pulse, setPulse] = useState(false)
  const [liveShot, setLiveShot] = useState<string | null>(null)
  const [liveUrl, setLiveUrl] = useState<string>(url)
  const [liveStatus, setLiveStatus] = useState<Props['status']>(status)

  // Watch the agent work: poll the newest active browser session.
  useEffect(() => {
    let cancelled = false
    let activeId: string | null = null

    const tick = async () => {
      try {
        const sessions = await sdk.browser.listSessions()
        if (cancelled) return
        const candidates = sessions.filter((s) => s.status === 'active' || s.status === 'initializing')
        const match = candidates.find((s) => s.url.includes(url) || url.includes(s.url)) ?? candidates[0]
        if (!match) {
          setLiveStatus('closed')
          return
        }
        activeId = match.id
        setLiveStatus(match.status)
        if (match.lastScreenshot) setLiveShot(match.lastScreenshot)
        const state = await sdk.browser.state(match.id)
        if (cancelled) return
        if (state.screenshot) setLiveShot(state.screenshot)
        if (state.url) setLiveUrl(state.url)
      } catch {
        // Browser API unavailable — fall back to static props.
      }
    }

    void tick()
    const interval = setInterval(() => void tick(), 2500)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [url])

  useEffect(() => {
    if (liveStatus === 'active') {
      const interval = setInterval(() => setPulse(p => !p), 1500)
      return () => clearInterval(interval)
    }
  }, [liveStatus])

  const shot = liveShot ?? lastScreenshot

  return (
    <div data-session={sessionId} className="my-4 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm bg-gray-50 dark:bg-gray-900">
      {/* Browser Chrome */}
      <div className="bg-gray-200 dark:bg-gray-800 px-3 py-2 border-b border-gray-300 dark:border-gray-700 flex items-center space-x-3">
        <div className="flex space-x-1.5">
          <div className="w-3 h-3 rounded-full bg-red-400"></div>
          <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
          <div className="w-3 h-3 rounded-full bg-green-400"></div>
        </div>
        <div className="flex-1 bg-white dark:bg-gray-700 text-xs px-3 py-1 rounded-md text-gray-600 dark:text-gray-300 flex items-center truncate">
          <svg className="w-3 h-3 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
          {liveUrl || 'about:blank'}
        </div>
        <button 
          onClick={() => setExpanded(!expanded)}
          className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-xs font-medium"
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {/* Viewport */}
      <div className={`relative w-full bg-white transition-all duration-300 ${expanded ? 'h-[400px]' : 'h-[200px]'} flex flex-col items-center justify-center`}>
        {shot ? (
          <img src={shot} alt="Browser viewport" className="w-full h-full object-cover object-top" />
        ) : (
          <div className="flex flex-col items-center text-gray-400 dark:text-gray-500">
            <svg className={`w-10 h-10 mb-2 ${liveStatus === 'active' ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            <span className="text-sm">
              {liveStatus === 'initializing' ? 'Starting Browser Engine...' : 
               liveStatus === 'active' ? 'Agent is browsing...' : 'Session Closed'}
            </span>
          </div>
        )}
        
        {liveStatus === 'active' && (
          <div className="absolute bottom-3 right-3 bg-black/70 backdrop-blur-md text-white text-xs px-3 py-1.5 rounded-full flex items-center">
            <span className={`w-2 h-2 rounded-full bg-green-400 mr-2 ${pulse ? 'opacity-100' : 'opacity-40'} transition-opacity`}></span>
            Live
          </div>
        )}
        {liveUrl && liveUrl !== 'about:blank' && (
          <a
            href={liveUrl}
            target="_blank"
            rel="noreferrer"
            className="absolute bottom-3 left-3 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm backdrop-blur transition hover:bg-white"
          >
            Open browser ↗
          </a>
        )}
      </div>
    </div>
  )
}
