import { useState } from 'react'

export function WebRtcVoiceControls() {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'speaking'>('idle')

  const toggleCall = () => {
    if (status === 'idle') {
      setStatus('connecting')
      setTimeout(() => setStatus('connected'), 1200)
    } else {
      setStatus('idle')
    }
  }

  return (
    <div className="flex items-center space-x-2">
      <button
        onClick={toggleCall}
        className={`p-2 rounded-full transition-all duration-300 flex items-center justify-center group ${
          status === 'idle' 
            ? 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300' 
            : 'bg-red-500 hover:bg-red-600 text-white shadow-md shadow-red-500/20'
        }`}
        title={status === 'idle' ? "Start Voice Call" : "End Call"}
      >
        {status === 'idle' ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l-8 8m0-8l8 8" /></svg>
        )}
      </button>

      {status !== 'idle' && (
        <div className="flex items-center space-x-2 bg-gray-100 dark:bg-gray-800 rounded-full px-3 py-1.5 text-xs font-medium border border-gray-200 dark:border-gray-700">
          <div className="flex space-x-1 items-end h-3">
            <span className={`w-0.5 bg-green-500 rounded-full ${status === 'connected' ? 'h-1.5 animate-pulse' : 'h-1'}`}></span>
            <span className={`w-0.5 bg-green-500 rounded-full ${status === 'connected' ? 'h-3 animate-pulse delay-75' : 'h-1'}`}></span>
            <span className={`w-0.5 bg-green-500 rounded-full ${status === 'connected' ? 'h-2 animate-pulse delay-150' : 'h-1'}`}></span>
          </div>
          <span className="text-gray-600 dark:text-gray-300">
            {status === 'connecting' ? 'Connecting...' : 'Live'}
          </span>
        </div>
      )}
    </div>
  )
}
