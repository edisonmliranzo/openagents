import { useEffect, useMemo, useState, useRef } from 'react'
import { Code2, Eye } from 'lucide-react'

interface Props {
  componentId: string
  code: string
  language: 'react' | 'html'
}

/**
 * Renders agent-generated UI in an isolated iframe.
 *
 * The frame is sandboxed with `allow-scripts` ONLY. `allow-same-origin` is
 * deliberately omitted: a `srcdoc` frame inherits the parent's origin, so
 * combining the two would hand agent-generated code full access to the
 * OpenAgents document (cookies, localStorage, DOM) — i.e. stored XSS.
 * Without it the frame runs in an opaque origin and cannot reach the parent.
 */
export function GenerativeUIWidget({ componentId, code, language }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [mounted, setMounted] = useState(false)
  const [showSource, setShowSource] = useState(false)

  const htmlContent = useMemo(() => {
    if (language === 'html') return code
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
          <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
          <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="p-4 antialiased bg-transparent text-gray-900 dark:text-gray-100">
          <div id="root"></div>
          <script type="text/babel">
            ${code.replace(/export default function/g, 'function')}

            // Auto-mount the last defined function if it's a React component
            const components = Object.keys(window).filter(k => /^[A-Z]/.test(k) && typeof window[k] === 'function');
            const App = components.length > 0 ? window[components[components.length - 1]] : null;

            if (App) {
              const root = ReactDOM.createRoot(document.getElementById('root'));
              root.render(<App />);
            }
          </script>
        </body>
      </html>
    `
  }, [code, language])

  useEffect(() => {
    if (!iframeRef.current) return
    iframeRef.current.srcdoc = htmlContent
    setMounted(true)
  }, [htmlContent])

  return (
    <div className="my-4 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm bg-white dark:bg-gray-800 transition-all">
      <div className="bg-gray-50 dark:bg-gray-900 px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center text-xs text-gray-500">
        <div className="flex items-center space-x-2">
          <span className="flex h-2 w-2 rounded-full bg-green-500" />
          <span>Interactive Component</span>
          <span
            className="rounded-full border border-gray-300 dark:border-gray-700 px-1.5 py-0.5 text-[10px]"
            title="Runs in an isolated sandbox with no access to this page"
          >
            sandboxed
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowSource((v) => !v)}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          {showSource ? <Eye size={11} /> : <Code2 size={11} />}
          {showSource ? 'Hide source' : 'View Source'}
        </button>
      </div>

      {showSource && (
        <pre className="max-h-72 overflow-auto border-b border-gray-200 dark:border-gray-700 bg-gray-950 px-4 py-3 text-[11px] leading-relaxed text-gray-100">
          {code}
        </pre>
      )}

      <div className="relative min-h-[200px] w-full">
        {!mounted && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 dark:bg-gray-800">
            <span className="animate-pulse">Rendering UI...</span>
          </div>
        )}
        <iframe
          ref={iframeRef}
          title={`generative-ui-${componentId}`}
          className="w-full h-full min-h-[250px] border-none"
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
        />
      </div>
    </div>
  )
}
