import Link from 'next/link'

export function WarRoomPanel({ agents, topic }: { agents: string[], topic: string }) {
  return (
    <div className="my-4 border border-indigo-200 dark:border-indigo-900/50 rounded-xl overflow-hidden shadow-sm bg-white dark:bg-gray-900">
      <div className="bg-indigo-50 dark:bg-indigo-900/20 px-4 py-3 border-b border-indigo-100 dark:border-indigo-900/50 flex flex-wrap justify-between items-center gap-2">
        <div className="flex items-center space-x-2">
          <div className="flex -space-x-2">
            {agents.map((agent, i) => (
              <div key={i} className="w-6 h-6 rounded-full bg-indigo-500 border-2 border-white dark:border-gray-900 flex items-center justify-center text-[10px] text-white font-bold" title={agent}>
                {agent.charAt(0)}
              </div>
            ))}
          </div>
          <span className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">War Room: {topic}</span>
        </div>
        <Link
          href="/war-room"
          className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-full font-medium"
        >
          Open war room
        </Link>
      </div>
      <div className="p-4 text-sm text-gray-600 dark:text-gray-300">
        Specialists ({agents.join(', ')}) were invited to debate this topic. Open the war room to see their live turns and shared canvas.
      </div>
    </div>
  )
}
